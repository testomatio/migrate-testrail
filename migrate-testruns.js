import { getTestRailEndpoints, fetchFromTestRail } from './testrail.js';
import { loginToTestomatio, getTestomatioEndpoints, postToTestomatio, fetchFromTestomatio, postReportToTestomatio, putReportToTestomatio, originId } from './testomatio.js';
import { pathToFileURL } from 'url';

const STATUS_MAP = {
  1: 'passed',
  2: 'skipped', // Blocked
  3: 'skipped', // Untested
  4: 'skipped', // Retest
  5: 'failed',
};

async function postTestRunToTestomatio(run, tests) {
  const { postTestEndpoint, postReporterEndpoint, postReporterTestRunEndpoint, putReporterEndpoint } = getTestomatioEndpoints();
  const title = `${run.name} @id:${run.id}`;
  const testomatioRun = await postReportToTestomatio(postReporterEndpoint, { description: run.description, title });

  if (!testomatioRun) {
    console.log('Skipping run', run.name);
    return;
  }

  console.log(`> Created run ${testomatioRun.uid} for ${run.name}`);

  for (const reportTest of tests) {
    const status = STATUS_MAP[reportTest.status_id];
    if (!status) {
      console.log(`Unknown status ${reportTest.status_id} for test ${reportTest.title}, skipping`);
      continue;
    }

    const test = await postToTestomatio(postTestEndpoint, 'tests', {}, originId(reportTest.case_id));
    if (!test) {
      process.stdout.write('x');
    }

    const testData = {
      status,
      rid: reportTest.id,
      title: reportTest.title,
    };

    if (test) {
      testData.test_id = test.id;
    }

    await postReportToTestomatio(postReporterTestRunEndpoint.replace(':uid', testomatioRun.uid), testData);
    process.stdout.write('.');
  }

  await putReportToTestomatio(putReporterEndpoint.replace(':uid', testomatioRun.uid), {
    status_event: 'finish',
  });
}

export default async function migrateTestRuns() {
  const { postRunEndpoint } = getTestomatioEndpoints();
  // API endpoints
  const {
    getRunsEndpoint,
  } = {
    getRunsEndpoint: '/api/v2/get_runs/' + process.env.TESTRAIL_PROJECT_ID,
  };

  try {
    await loginToTestomatio();

    const existingRuns = await fetchFromTestomatio(postRunEndpoint);
    const existingRunIds = new Set();
    if (existingRuns && existingRuns.data) {
      for (const run of existingRuns.data) {
        const match = run.attributes.title.match(/@id:(\d+)/);
        if (!match) continue;
        existingRunIds.add(parseInt(match[1], 10));
      }
    }
    console.log('Found', existingRunIds.size, 'existing imported runs in Testomat.io');

    // Fetch all test runs
    const runs = await fetchFromTestRail(getRunsEndpoint, 'runs');
    console.log('Found', runs.length, 'test runs');

    for (const run of runs) {
      if (existingRunIds.has(run.id)) {
        console.log(`Run ${run.name} (${run.id}) already exists in Testomat.io, skipping.`);
        continue;
      }
      // Fetch tests for this run
      const tests = await fetchFromTestRail(`/api/v2/get_tests/${run.id}`, 'tests');
      // Fetch results for this run (optional, can be implemented later)
      // const results = await fetchFromTestRail(`/api/v2/get_results_for_run/${run.id}`, 'results');
      await postTestRunToTestomatio(run, tests);
    }

    console.log('<Done migrating test runs>');
  } catch (error) {
    console.error(error);
  }
}

// Allow running as standalone script
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    try {
      await import('dotenv/config');
      const { configureTestRail } = await import('./testrail.js');
      const { configureTestomatio } = await import('./testomatio.js');
      configureTestRail(
        process.env.TESTRAIL_URL,
        process.env.TESTRAIL_USERNAME,
        process.env.TESTRAIL_PASSWORD,
        process.env.TESTRAIL_PROJECT_ID
      );
      configureTestomatio(
        process.env.TESTOMATIO_TOKEN,
        process.env.TESTOMATIO_HOST || 'https://app.testomat.io',
        process.env.TESTOMATIO_PROJECT,
      );
      await migrateTestRuns();
    } catch (error) {
      console.error(error);
    }
  })();
} 