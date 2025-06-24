import { getTestRailEndpoints, fetchFromTestRail, downloadFile } from './testrail.js';
import { loginToTestomatio, getTestomatioEndpoints, postToTestomatio, fetchFromTestomatio, postReportToTestomatio, putReportToTestomatio, originId } from './testomatio.js';
import { pathToFileURL } from 'url';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';

let s3Client;
let statuses;

const STATUS_MAP = {
  1: 'passed',
  2: 'skipped', // Blocked
  3: 'skipped', // Untested
  4: 'skipped', // Retest
  5: 'failed',
};

async function uploadToS3(filePath, fileName) {
  if (!s3Client && process.env.S3_ACCESS_KEY_ID && process.env.S3_BUCKET) {
      s3Client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT, // Optional custom endpoint (e.g., for MinIO, DigitalOcean Spaces, etc.)
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  if (!s3Client) {
    console.log('S3 client not configured, skipping upload');
    return null;
  }

  try {
    const fileContent = fs.readFileSync(filePath);
    const key = `testrail-attachments/${fileName}`;
    
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: fileContent,
        ACL: 'private',
      },
    });

    const response = await upload.done();

    // Get the actual S3 URL from the response
    let s3Location = response?.Location?.trim()

    return s3Location;
  } catch (error) {
    console.error(`Error uploading ${filePath} to S3:`, error);
    return null;
  }
}

async function getStatuses() {
  const statusHash = {};
  const statuses = await fetchFromTestRail('/api/v2/get_statuses');
  for (const status of statuses) {
    statusHash[status.id] = status.name;
  }
  return statusHash;
}

async function postTestRunToTestomatio(run, tests) {
  const { postTestEndpoint, postReporterEndpoint, postReporterTestRunEndpoint, putReporterEndpoint } = getTestomatioEndpoints();
  const { downloadAttachmentEndpoint } = getTestRailEndpoints();
  if (!statuses) {
    statuses = await getStatuses();
  }
  const title = `${run.name} @id:${run.id}`;
  const testomatioRun = await postReportToTestomatio(postReporterEndpoint, { description: run.description, title });

  if (!testomatioRun) {
    console.log('Skipping run', run.name);
    return;
  }

  console.log(`> Created run ${testomatioRun.uid} for ${run.name}`);

  for (const reportTest of tests) {
    let status = statuses[reportTest.status_id];

    // skipping unknown statuses
    if (!['passed', 'skipped', 'failed'].includes(status)) {
      status = 'skipped';
    }

    const result = await fetchFromTestRail(`/api/v2/get_results/${reportTest.id}`);
    const message = result[0].results.filter(r => r.comment).map(r => r.comment).join('\n') || null;
    const steps = result[0].results.filter(r => r.custom_step_results)
      .map(r => customStepsToAnsi(r.custom_step_results)).flat() || [];

    // Fetch, download and upload attachments for this test
    const artifacts = [];
    try {
      let attachments = await fetchFromTestRail(`/api/v2/get_attachments_for_test/${reportTest.id}`);      
      // remove duplicates
      attachments = Array.from(new Map(attachments.map(a => [a.id, a])).values());

      for (const attachment of attachments) {
        steps.filter(step => step?.log).forEach(step => {
          step.error = step?.error?.replaceAll(`index.php?/attachments/get/${attachment.id}`, attachment.filename);
          step.error = step?.error?.replaceAll('![]', '');
          step.log = step.log.replaceAll(`index.php?/attachments/get/${attachment.id}`, `\u001b[1m${attachment.filename}\u001b[0m`);
          step.log = step.log.replaceAll('![]', '');
        });

        let filePath;
        try {
          filePath = await downloadFile(downloadAttachmentEndpoint + attachment.id);
          if (!filePath) filePath = await downloadFile(downloadAttachmentEndpoint + attachment.cassandra_file_id);

          if (!filePath) {
            throw new Error(`Failed to download attachment ${attachment.name}`);
          }
          const s3Url = await uploadToS3(filePath, testomatioRun.uid + '/' + attachment.filename);
          if (s3Url) artifacts.push(s3Url);
          // we can't display attachment in markdown, so we replace it with filename
        } catch (downloadError) {
          console.log(`Failed to download attachment ${attachment.name}:`, downloadError.message);
        }
      }
    } catch (error) {
      console.log(`Error fetching attachments for test ${reportTest.title}: ${JSON.stringify(reportTest)}`, error.message);
    }

    const test = await postToTestomatio(postTestEndpoint, 'tests', {}, originId(reportTest.case_id));
    if (!test) {
      process.stdout.write('x');
    }

    const testData = {
      status,
      rid: reportTest.id,
      title: reportTest.title,
      message,
      steps,
      artifacts,
    };

    if (test) {
      testData.test_id = test.id;
    }

    const res = await postReportToTestomatio(postReporterTestRunEndpoint.replace(':uid', testomatioRun.uid), testData);
    process.stdout.write('.');
  }

  await putReportToTestomatio(putReporterEndpoint.replace(':uid', testomatioRun.uid), {
    status_event: 'finish',
  });
}

export default async function migrateTestRuns() {
  const { postRunEndpoint } = getTestomatioEndpoints();
  const { getRunsEndpoint } = getTestRailEndpoints();

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
      const tests = await fetchFromTestRail(`/api/v2/get_tests/${run.id}`, 'tests');
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

function customStepsToAnsi(steps, indent = 0) {
  const indentStr = ' '.repeat(indent * 2);
  return steps.map((step, idx) => {
    const title = step.content;
    let log = '';
    let error = null;
    if (step.status_id && statuses) {
      const status = statuses[step.status_id];
      if ((status === 'failed' || status === 'blocked') && step.actual) {
        error = "Actual: " + step.actual;
      }
      log += `${indentStr}  Status: ${status}\n`;
    }
    if (step.expected) log += `Expected: ${step.expected}\n`;
    if (step.actual) log += `Actual: ${step.actual}\n`;
    return { title, log, error, category: 'user' };
  });
}

