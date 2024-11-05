import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import { COMPARE_SUMMARY_IDENTIFIER } from '@useoptic/optic/build/commands/ci/comment/common';
import { initCli } from '@useoptic/optic/build/init';
import {
  createComment,
  findCommentByTag,
  getBaseBranch,
  getInputs,
  getPrSha,
  postResultsToPRComments,
  runDiff,
  updateComment
} from '../src/utils';

jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('@actions/github');
jest.mock('@useoptic/optic/build/init');
jest.mock('@useoptic/optic/build/init', () => ({
  initCli: jest.fn()
}));

describe('utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInputs', () => {
    it('should return the correct inputs', () => {
      jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
        switch (name) {
          case 'compare-from':
            return 'main';
          case 'match':
            return '**/*.ts';
          case 'ignore':
            return '**/*.test.ts';
          case 'standard':
            return 'standard';
          case 'github-token':
            return 'fake-token';
          default:
            return '';
        }
      });
      jest.spyOn(core, 'getBooleanInput').mockImplementation((name: string) => {
        switch (name) {
          case 'post-pr-comment':
            return true;
          case 'verbose':
            return false;
          default:
            return false;
        }
      });

      const inputs = getInputs();

      expect(inputs).toEqual({
        compareFrom: 'main',
        match: '**/*.ts',
        ignore: '**/*.test.ts',
        standard: 'standard',
        githubToken: 'fake-token',
        postComment: true,
        verbose: false
      });
    });
  });

  describe('runDiff', () => {
    it('should call initCli and parseAsync with correct arguments when compareFrom is not provided', async () => {
      const inputs = {
        compareFrom: '',
        match: '**/*.ts',
        ignore: '**/*.test.ts',
        standard: 'standard',
        githubToken: 'fake-token',
        postComment: true,
        verbose: false
      };

      const cliMock = {
        parseAsync: jest.fn()
      };
      (initCli as jest.Mock).mockResolvedValue(cliMock);
      github.context.eventName = 'pull_request';
      github.context.payload = {
        pull_request: {
          base: { ref: 'base-branch' },
          number: 0
        }
      };

      jest
        .spyOn(exec, 'getExecOutput')
        .mockImplementation(async (cmd, args) => {
          if (cmd === 'git' && args && args.includes('base-branch')) {
            return { exitCode: 0, stdout: 'base-branch', stderr: '' };
          }
          return { exitCode: 1, stdout: '', stderr: '' };
        });

      await runDiff(inputs);

      expect(initCli).toHaveBeenCalledWith(undefined, { hideNotifier: true });
      expect(cliMock.parseAsync).toHaveBeenCalledWith(
        [
          'diff-all',
          '--check',
          '--compare-from',
          'base-branch',
          '--match',
          '**/*.ts',
          '--ignore',
          '**/*.test.ts',
          '--standard',
          'standard'
        ],
        { from: 'user' }
      );
    });

    it('should call initCli and parseAsync with correct arguments', async () => {
      const inputs = {
        compareTo: 'main',
        compareFrom: 'feature-branch',
        match: '**/*.ts',
        ignore: '**/*.test.ts',
        standard: 'standard',
        githubToken: 'fake-token',
        postComment: true,
        verbose: false
      };

      const cliMock = {
        parseAsync: jest.fn()
      };
      (initCli as jest.Mock).mockResolvedValue(cliMock);

      await runDiff(inputs);

      expect(initCli).toHaveBeenCalledWith(undefined, { hideNotifier: true });
      expect(cliMock.parseAsync).toHaveBeenCalledWith(
        [
          'diff-all',
          '--check',
          '--compare-from',
          'feature-branch',
          '--match',
          '**/*.ts',
          '--ignore',
          '**/*.test.ts',
          '--standard',
          'standard'
        ],
        { from: 'user' }
      );
    });
  });

  describe('getPrSha', () => {
    it('should return the merge base sha when pull_request is defined', async () => {
      github.context.payload = {
        pull_request: {
          base: { sha: 'base-sha' },
          head: { sha: 'head-sha' },
          number: 1
        }
      };

      (exec.getExecOutput as jest.Mock).mockResolvedValue({
        exitCode: 0,
        stdout: 'merge-base-sha'
      });

      const result = await getPrSha();

      expect(exec.getExecOutput).toHaveBeenCalledWith(
        'git',
        ['merge-base', 'base-sha', 'head-sha'],
        { ignoreReturnCode: true }
      );
      expect(result).toBe('merge-base-sha');
    });

    it('should return the base sha when merge-base command fails', async () => {
      github.context.payload = {
        pull_request: {
          base: { sha: 'base-sha' },
          head: { sha: 'head-sha' },
          number: 1
        }
      };

      (exec.getExecOutput as jest.Mock).mockResolvedValue({
        exitCode: 1,
        stdout: ''
      });

      const result = await getPrSha();

      expect(exec.getExecOutput).toHaveBeenCalledWith(
        'git',
        ['merge-base', 'base-sha', 'head-sha'],
        { ignoreReturnCode: true }
      );
      expect(result).toBe('base-sha');
    });

    it('should return an empty string when pull_request is not defined', async () => {
      github.context.payload = {};

      const result = await getPrSha();

      expect(result).toBe('');
    });
  });

  describe('postResultsToPRComments', () => {
    it('should not post a comment if postComment is false', async () => {
      await postResultsToPRComments('content', false);

      expect(github.getOctokit).not.toHaveBeenCalled();
    });

    it('should update a comment if a comment with the tag is found', async () => {
      github.context.payload = {
        pull_request: {
          number: 1,
          base: { sha: 'base-sha' },
          head: { sha: 'head-sha', ref: 'head-ref' }
        }
      };
      Object.defineProperty(github.context, 'issue', {
        value: { number: 1 },
        configurable: true
      });
      Object.defineProperty(github.context, 'repo', {
        value: {
          owner: 'owner',
          repo: 'repo'
        },
        configurable: true
      });
      const client = {
        rest: {
          issues: {
            createComment: jest.fn(),
            updateComment: jest.fn(),
            listComments: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 1,
                  body: `${COMPARE_SUMMARY_IDENTIFIER} some comment with tag`
                }
              ]
            })
          }
        }
      };
      (github.getOctokit as jest.Mock).mockReturnValue(client);

      await postResultsToPRComments('content', true);

      expect(client.rest.issues.updateComment).toHaveBeenCalledWith({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        comment_id: 1,
        body: 'content'
      });
    });

    it('should post a comment to the PR', async () => {
      github.context.payload = {
        pull_request: {
          number: 1,
          base: { sha: 'base-sha' },
          head: { sha: 'head-sha', ref: 'head-ref' }
        }
      };
      Object.defineProperty(github.context, 'repo', {
        value: {},
        configurable: true
      });
      Object.defineProperty(github.context, 'issue', {
        value: { number: 1 },
        writable: true
      });

      const client = {
        rest: {
          issues: {
            createComment: jest.fn(),
            updateComment: jest.fn(),
            listComments: jest.fn().mockResolvedValue({ data: [] })
          }
        }
      };
      (github.getOctokit as jest.Mock).mockReturnValue(client);

      await postResultsToPRComments('content', true);

      expect(client.rest.issues.createComment).toHaveBeenCalledWith({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: github.context.issue.number,
        body: 'content'
      });
    });
  });

  describe('findCommentByTag', () => {
    beforeEach(() => {});

    it('should return the comment id if a comment with the tag is found', async () => {
      const client = {
        rest: {
          issues: {
            listComments: jest.fn().mockResolvedValue({
              data: [{ id: 1, body: 'some comment with tag' }]
            })
          }
        }
      };

      const result = await findCommentByTag(client as any, 'tag');

      expect(result).toBe(1);
    });

    it('should return -1 if an error occurs', async () => {
      const client = {
        rest: {
          issues: {
            listComments: jest.fn().mockRejectedValue(new Error('error'))
          }
        }
      };

      const result = await findCommentByTag(client as any, 'tag');

      expect(result).toBe(-1);
    });
  });

  describe('createComment', () => {
    it('should create a comment', async () => {
      const client = {
        rest: {
          issues: {
            createComment: jest.fn()
          }
        }
      };

      await createComment(client as any, 'body');

      expect(client.rest.issues.createComment).toHaveBeenCalledWith({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: github.context.issue.number,
        body: 'body'
      });
    });
    it('should handle errors', async () => {
      const client = {
        rest: {
          issues: {
            createComment: jest.fn().mockRejectedValue(new Error('Test error'))
          }
        }
      };

      await createComment(client as any, 'body');

      expect(client.rest.issues.createComment).toHaveBeenCalledWith({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: github.context.issue.number,
        body: 'body'
      });
      expect(core.debug).toHaveBeenCalledWith(
        'Failed to post comment – Test error'
      );
    });
  });

  describe('getBaseBranch', () => {
    it('should return the base branch', async () => {
      github.context.eventName = 'pull_request';
      github.context.payload = {
        pull_request: {
          base: { ref: 'base-branch' },
          number: 1
        }
      };

      jest
        .spyOn(exec, 'getExecOutput')
        .mockImplementation(async (cmd, args) => {
          if (cmd === 'git' && args && args.includes('base-branch')) {
            return { exitCode: 0, stdout: 'base-branch', stderr: '' };
          }
          return { exitCode: 1, stdout: '', stderr: '' };
        });

      const result = await getBaseBranch();

      expect(result).toBe('base-branch');
    });

    it('should return the origin base branch', async () => {
      github.context.eventName = 'pull_request';
      github.context.payload = {
        pull_request: {
          base: { ref: 'base-branch' },
          number: 1
        }
      };

      jest
        .spyOn(exec, 'getExecOutput')
        .mockImplementation(async (cmd, args) => {
          if (cmd === 'git' && args && args.includes('origin/base-branch')) {
            return { exitCode: 0, stdout: 'origin/base-branch', stderr: '' };
          }
          return { exitCode: 1, stdout: '', stderr: '' };
        });

      const result = await getBaseBranch();

      expect(result).toBe('origin/base-branch');
    });

    it('should return an empty string if pull_request is not defined', async () => {
      github.context.eventName = 'push';
      github.context.payload = {};

      const result = await getBaseBranch();

      expect(result).toBe('');
    });
  });

  describe('updateComment', () => {
    it('should handle errors', async () => {
      const client = {
        rest: {
          issues: {
            updateComment: jest.fn().mockRejectedValue(new Error('Test error'))
          }
        }
      };

      await updateComment(client as any, 1, 'body');

      expect(client.rest.issues.updateComment).toHaveBeenCalledWith({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        comment_id: 1,
        body: 'body'
      });
      expect(core.debug).toHaveBeenCalledWith(
        'Failed to update comment – Test error'
      );
    });
    it('should update a comment', async () => {
      const client = {
        rest: {
          issues: {
            updateComment: jest.fn()
          }
        }
      };

      await updateComment(client as any, 1, 'body');

      expect(client.rest.issues.updateComment).toHaveBeenCalledWith({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        comment_id: 1,
        body: 'body'
      });
    });
  });
});
