import 'dotenv/config'
import migrateTestCases from './migrate.js';
import { configureTestRail } from './testrail.js';
import { configureTestomatio } from './testomatio.js';

// ENABLE THIS LINE TO RUN THE SCRIPT
// PASS VALID VARIABLES TO ACCESS TESTRAIL
// configureTestRail(testrailBaseUrl, username, password, projectId);


// ENABLE THIS LINE TO RUN THE SCRIPT
// PASS VALID VARIABLES TO ACCESS TESTOMATIO
// configureTestomatio(testomatioAccessToken, testomatioHost, testomatioProject);


export const handler = async (event) => {
    try {
        console.log('Configuring Testrail...');
        configureTestRail(
            event.TESTRAIL_URL,
            event.TESTRAIL_USERNAME,
            event.TESTRAIL_PASSWORD,
            event.TESTRAIL_PROJECT_ID
        );

        console.log('Configuring Testomatio...');
        configureTestomatio(
            event.TESTOMATIO_TOKEN,
            event.TESTOMATIO_HOST || 'https://app.testomat.io',
            event.TESTOMATIO_PROJECT,
        );

        console.log('Starting migration...');
        const result = await migrateTestCases();
        console.log('Migration completed:', result);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Migration completed successfully', result })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal Server Error', error: error.message })
        };
    }
};


