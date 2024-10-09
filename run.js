import 'dotenv/config'
import migrateTestCases from './migrate.js';
import {configureTestRail} from './testrail.js';
import {configureTestomatio} from './testomatio.js';

// Now you can access process.env.CF_ACCOUNT_ID wherever you need in your run.js logic

export default {
    async fetch(request, env, ctx) {
        let accountId = env.CF_ACCOUNT_ID;
        // Your existing logic in run.js
        console.log(`Using Cloudflare account ID: ${accountId}`);

        // ENABLE THIS LINE TO RUN THE SCRIPT
        // PASS VALID VARIABLES TO ACCESS TESTRAIL
        // configureTestRail(testrailBaseUrl, username, password, projectId);
        configureTestRail(
            env.TESTRAIL_URL,
            env.TESTRAIL_USERNAME,
            env.TESTRAIL_PASSWORD,
            env.TESTRAIL_PROJECT_ID
        );

        // ENABLE THIS LINE TO RUN THE SCRIPT
        // PASS VALID VARIABLES TO ACCESS TESTOMATIO
        // configureTestomatio(testomatioAccessToken, testomatioHost, testomatioProject);
        configureTestomatio(
            env.TESTOMATIO_TOKEN,
            env.TESTOMATIO_HOST || 'https://app.testomat.io',
            env.TESTOMATIO_PROJECT,
        );

        await migrateTestCases();

    }
}
