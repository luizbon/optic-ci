function getLabel(operationsModifsCount, opts) {
  return Object.keys(operationsModifsCount)
    .filter((k) => operationsModifsCount[k])
    .map(
      (key, ix) =>
        `${operationsModifsCount[key]} ${
          ix === 0
            ? operationsModifsCount[key] > 1
              ? "operations "
              : "operation "
            : ""
        }${key}`
    )
    .join(opts?.joiner ?? ", ");
}

function typeofDiff(diff) {
  return diff.after !== undefined && diff.before !== undefined
    ? "changed"
    : diff.after !== undefined
    ? "added"
    : "removed";
}

function typeofV3Diffs(diffs) {
  for (const diff of diffs) {
    if (diff.trail === "") {
      return typeofDiff(diff);
    }
  }
  return diffs.length > 0 ? "changed" : null;
}

function getEndpointDiffs(endpoint) {
  const items = [
    ...endpoint.diffs,
    ...endpoint.request.diffs,
    ...[
      ...Object.values(endpoint.queryParameters),
      ...Object.values(endpoint.cookieParameters),
      ...Object.values(endpoint.pathParameters),
      ...Object.values(endpoint.headerParameters),
    ].flatMap((r) => r.diffs),
  ];
  for (const content of Object.values(endpoint.request.contents)) {
    items.push(...content.examples.diffs);
    items.push(...Object.values(content.fields).flatMap((r) => r.diffs));
  }
  for (const response of Object.values(endpoint.responses)) {
    items.push(
      ...response.diffs,
      ...Object.values(response.headers).flatMap((r) => r.diffs)
    );
    for (const content of Object.values(response.contents)) {
      items.push(...content.examples.diffs);
      items.push(...Object.values(content.fields).flatMap((r) => r.diffs));
    }
  }
  return items;
}

function getOperationsChanged(groupedDiffs) {
  const addedOps = new Set();
  const changedOps = new Set();
  const removedOps = new Set();
  for (const endpoint of Object.values(groupedDiffs.endpoints)) {
    const id = `${endpoint.method.toUpperCase()} ${endpoint.path}`;
    const diffs = getEndpointDiffs(endpoint);
    const typeofDiffs = typeofV3Diffs(endpoint.diffs);
    if (typeofDiffs === "added") {
      addedOps.add(id);
    } else if (typeofDiffs === "removed") {
      removedOps.add(id);
    } else if (diffs.length > 0) {
      changedOps.add(id);
    }
  }

  return {
    added: addedOps,
    changed: changedOps,
    removed: removedOps,
  };
}

function getOperationsChangedLabel(groupedDiffs, opts) {
  const { added, changed, removed } = getOperationsChanged(groupedDiffs);

  return getLabel(
    {
      added: added.size,
      changed: changed.size,
      removed: removed.size,
    },
    opts
  );
}

function getOperationsText(groupedDiffs, options) {
  const ops = getOperationsChanged(groupedDiffs);

  const operationsText = options.verbose
    ? [
        ...[...ops.added].map((o) => `\`${o}\` (added)`),
        ...[...ops.changed].map((o) => `\`${o}\` (changed)`),
        ...[...ops.removed].map((o) => `\`${o}\` (removed)`),
      ].join("\n")
    : "";
  return `${getOperationsChangedLabel(groupedDiffs, {
    joiner: options.labelJoiner,
  })}
  
    ${operationsText}
  `;
}

const getChecksLabel = (results, severity) => {
  let totalChecks = results.length;
  let failingChecks = 0;
  let exemptedFailingChecks = 0;

  for (const result of results) {
    if (result.passed) continue;
    if (result.severity < severity) continue;
    if (result.exempted) exemptedFailingChecks += 1;
    else failingChecks += 1;
  }

  const exemptedChunk =
    exemptedFailingChecks > 0 ? `, ${exemptedFailingChecks} exempted` : "";

  return failingChecks > 0
    ? `⚠️ **${failingChecks}**/**${totalChecks}** failed${exemptedChunk}`
    : totalChecks > 0
    ? `✅ **${totalChecks}** passed${exemptedChunk}`
    : `ℹ️ No automated checks have run`;
};

module.exports = ({ context, results }) => {
  const anyCompletedHasWarnings = results.completed.some(
    (s) => s.warnings.length > 0
  );
  return `
    <!-- commit_sha: ${context.sha} -->
    ${
      results.completed.length > 0
        ? `### APIS Changed
            <table>
            <thead>
                <tr>
                    <th>API</th>
                    <th>Changes</th>
                    <th>Rules</th>
                    ${anyCompletedHasWarnings ? `<th>Warnings</th>` : ""}
                </tr>
            </thead>
            <tbody>
            ${results.completed
              .map(
                (s) => `<tr>
                <td>${s.apiName}</td>
                <td>${getOperationsText(s.comparison.groupedDiffs, {
                  verbose: true,
                  labelJoiner: ",\n",
                })}
                </td>
                <td>${getChecksLabel(
                  s.comparison.results,
                  results.severity
                )}</td>
                ${
                  anyCompletedHasWarnings
                    ? `<td>${s.warnings.join("\n")}</td>`
                    : ""
                }
            </tr>`
              )
              .join("\n")}
            </tbody>
            </table>`
        : ""
    } ${
    results.failed.length > 0
      ? `### Errors running optic
        
        <table>
        <thead>
        <tr>
        <th>API</th>
        <th>Error</th>
        </tr>
        </thead>
        <tbody>
        ${results.failed
          .map(
            (s) =>
              `<tr><td>${s.apiName}</td><td>${"```"}${
                s.error
              }${"```"}</td></tr>`
          )
          .join("\n")}
        </tbody>
        </table>
        `
      : ""
  }

    Summary of API changes for commit (${context.sha})

    ${
      results.noop.length > 0
        ? `${
            results.noop.length === 1 ? "1 API" : `${results.noop.length} APIs`
          } had no changes`
        : ""
    }`;
};