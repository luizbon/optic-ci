import * as core from '@actions/core';
import { generateCompareSummaryMarkdown } from '@useoptic/optic/build/commands/ci/comment/common';
import {
  CiRunDetails,
  readDataForCi
} from '@useoptic/optic/build/utils/ci-data';
import { getInputs, getPrSha, postResultsToPRComments, runDiff } from './utils';

export async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    await runDiff(inputs);

    const ciRunDetails: CiRunDetails = await readDataForCi();
    const sha = await getPrSha();
    const body = generateCompareSummaryMarkdown({ sha: sha }, ciRunDetails, {
      verbose: inputs.verbose
    });
    await postResultsToPRComments(body, inputs.postComment);

    if (
      ciRunDetails.completed.some(result => result.warnings) ||
      ciRunDetails.failed.length > 0
    ) {
      core.setFailed('Diff failed');
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}
