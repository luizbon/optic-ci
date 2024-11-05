import * as core from '@actions/core';
import { generateCompareSummaryMarkdown } from '@useoptic/optic/build/commands/ci/comment/common';
import { readDataForCi } from '@useoptic/optic/build/utils/ci-data';
import { run } from '../src/main';
import * as utils from '../src/utils';

jest.mock('@actions/core');
jest.mock('@useoptic/optic/build/commands/ci/comment/common');
jest.mock('@useoptic/optic/build/utils/ci-data');
jest.mock('../src/utils');
jest.mock('@useoptic/optic/build/init', () => ({
  initCli: jest.fn()
}));

describe('main', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should run the action successfully', async () => {
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

    (utils.getInputs as jest.Mock).mockReturnValue(inputs);
    (utils.runDiff as jest.Mock).mockResolvedValue(undefined);
    (readDataForCi as jest.Mock).mockResolvedValue({
      completed: [],
      failed: []
    });
    (utils.getPrSha as jest.Mock).mockResolvedValue('sha');
    (generateCompareSummaryMarkdown as jest.Mock).mockReturnValue('markdown');
    (utils.postResultsToPRComments as jest.Mock).mockResolvedValue(undefined);

    await run();

    expect(utils.getInputs).toHaveBeenCalled();
    expect(utils.runDiff).toHaveBeenCalledWith(inputs);
    expect(readDataForCi).toHaveBeenCalled();
    expect(utils.getPrSha).toHaveBeenCalled();
    expect(generateCompareSummaryMarkdown).toHaveBeenCalledWith(
      { sha: 'sha' },
      { completed: [], failed: [] },
      { verbose: false }
    );
    expect(utils.postResultsToPRComments).toHaveBeenCalledWith(
      'markdown',
      true
    );
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('should set the action as failed if there are warnings or failures', async () => {
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

    (utils.getInputs as jest.Mock).mockReturnValue(inputs);
    (utils.runDiff as jest.Mock).mockResolvedValue(undefined);
    (readDataForCi as jest.Mock).mockResolvedValue({
      completed: [{ warnings: true }],
      failed: []
    });
    (utils.getPrSha as jest.Mock).mockResolvedValue('sha');
    (generateCompareSummaryMarkdown as jest.Mock).mockReturnValue('markdown');
    (utils.postResultsToPRComments as jest.Mock).mockResolvedValue(undefined);

    await run();

    expect(core.setFailed).toHaveBeenCalledWith('Diff failed');
  });

  it('should handle errors', async () => {
    const error = new Error('Test error');
    (utils.getInputs as jest.Mock).mockImplementation(() => {
      throw error;
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith('Test error');
  });
});
