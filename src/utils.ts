import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { ExecOutput } from '@actions/exec';
import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import { PullRequestEvent } from '@octokit/webhooks-definitions/schema';
import { COMPARE_SUMMARY_IDENTIFIER } from '@useoptic/optic/build/commands/ci/comment/common';
import { initCli } from '@useoptic/optic/build/init';

export interface Inputs {
  compareFrom: string;
  match: string;
  ignore: string;
  standard: string;
  githubToken: string;
  postComment: boolean;
  verbose: boolean;
}

export const getInputs = (): Inputs => {
  return {
    compareFrom: core.getInput('compare-from'),
    match: core.getInput('match'),
    ignore: core.getInput('ignore'),
    standard: core.getInput('standard'),
    githubToken: core.getInput('github-token'),
    postComment: core.getBooleanInput('post-pr-comment'),
    verbose: core.getBooleanInput('verbose')
  };
};

export const runDiff = async (inputs: Inputs): Promise<void> => {
  const args = ['diff-all', '--check'];
  if (inputs.compareFrom) {
    args.push('--compare-from', inputs.compareFrom);
  } else {
    const headBranch = await getBaseBranch();
    if (headBranch) {
      args.push('--compare-from', headBranch);
    }
  }
  if (inputs.match) {
    args.push('--match', inputs.match);
  }
  if (inputs.ignore) {
    args.push('--ignore', inputs.ignore);
  }
  if (inputs.standard) {
    args.push('--standard', inputs.standard);
  }

  const cli = await initCli(undefined, { hideNotifier: true });
  await cli.parseAsync(args, { from: 'user' });
};

const gitOutput = async (
  args: string[],
  options: exec.ExecOptions = {}
): Promise<ExecOutput> => {
  return await exec.getExecOutput('git', args, options);
};

export const getPrSha = async (): Promise<string> => {
  if (github.context.payload.pull_request !== undefined) {
    const output = await gitOutput(
      [
        'merge-base',
        github.context.payload.pull_request.base.sha as string,
        github.context.payload.pull_request.head.sha as string
      ] as string[],
      {
        ignoreReturnCode: true
      }
    );
    if (output.exitCode === 0) {
      return output.stdout.trim();
    } else {
      return github.context.payload.pull_request.base.sha as string;
    }
  }
  return '';
};

export const getBaseBranch = async (): Promise<string> => {
  if (github.context.eventName === 'pull_request') {
    const prPayload = github.context.payload as PullRequestEvent;
    const base = prPayload.pull_request.base.ref;
    let output = await gitOutput(['branch', '--list', base]);
    if (output.stdout.trim()) {
      return base;
    }
    const remoteBase = `origin/${base}`;
    output = await gitOutput(['branch', '--remotes', '--list', remoteBase]);
    if (output.stdout.trim()) {
      return remoteBase;
    }
  }
  return '';
};

export const postResultsToPRComments = async (
  content: string,
  postComment: boolean
): Promise<void> => {
  const pr = github.context.payload.pull_request ?? '';
  if (!postComment || !pr) {
    return;
  }
  const client = github.getOctokit(getInputs().githubToken);
  const comment_id = await findCommentByTag(client, COMPARE_SUMMARY_IDENTIFIER);
  if (comment_id !== -1) {
    await updateComment(client, comment_id, content);
  } else {
    await createComment(client, content);
  }
};

export const findCommentByTag = async (
  client: InstanceType<typeof GitHub>,
  tag: string
): Promise<number> => {
  try {
    const { data: comments } = await client.rest.issues.listComments({
      ...github.context.repo,
      issue_number: github.context.issue.number
    });
    const comment = comments.find(c => c?.body?.includes(tag));
    return comment ? comment.id : -1;
  } catch (error) {
    core.debug(`Failed to find comment by tag – ${(error as Error).message}`);
    return -1;
  }
};

export const createComment = async (
  client: InstanceType<typeof GitHub>,
  body: string
): Promise<void> => {
  try {
    await client.rest.issues.createComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: github.context.issue.number,
      body
    });
  } catch (error) {
    core.debug(`Failed to post comment – ${(error as Error).message}`);
  }
};

export const updateComment = async (
  client: InstanceType<typeof GitHub>,
  comment_id: number,
  body: string
): Promise<void> => {
  try {
    await client.rest.issues.updateComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      comment_id,
      body
    });
  } catch (error) {
    core.debug(`Failed to update comment – ${(error as Error).message}`);
  }
};
