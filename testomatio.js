import fs from 'fs';
import debug from 'debug';

const logOutput = debug('testomatio:testrail:out');

// disable all save requests
const DRY_RUN = !!process.env.DRY_RUN;

let token;
let host;
let project;

let jwtToken;

export function getTestomatioEndpoints() {
  return {
    postSuiteEndpoint: `/api/${project}/suites`,
    deleteEmptySuitesEndpoint: `/api/${project}/suites/delete_empty`,
    syncEndpoint: `/api/${project}/sync`,
    postTestEndpoint: `/api/${project}/tests`,
    postAttachmentEndpoint: `/api/${project}/tests/:tid/attachment`,
    postIssueLinkEndpoint: `/api/${project}/ims/issues/link`,
    postJiraIssueEndpoint: `/api/${project}/jira/issues`,
    postLabelEndpoint: `/api/${project}/labels`,
    postLabelLinkEndpoint: `/api/${project}/labels/:lid/link`,
  }
}

export function configureTestomatio(
  testomatioAccessToken,
  testomatioHost,
  testomatioProject
) {
  if (!testomatioAccessToken || !testomatioHost || !testomatioProject) {
    throw new Error('Missing required Testomat.io parameters');
  }
  token = testomatioAccessToken;
  host = testomatioHost;
  project = testomatioProject;
}

export async function loginToTestomatio() {
  const response = await fetch(`${host}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: "api_token=" + token,
  });

  const data = await response.json();
  logOutput('loginToTestomatio', data);
  jwtToken = data.jwt;
}

export async function fetchFromTestomatio(endpoint) {
  if (DRY_RUN) return;
  const response = await fetch(`${host}/${endpoint}`, {
    headers: {
      'Authorization': jwtToken,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function postToTestomatio(endpoint, type = null, data = {}, originId = null) {
  if (DRY_RUN) return;
  let response;
  logOutput('AccessToken', jwtToken);

  if (!type) {
    try {
      logOutput('postToTestomatio', `${host}/${endpoint}`, JSON.stringify(data));

      response = await fetchWithRetry(() => fetch(`${host}${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': jwtToken,
        }}));

      if (!response.ok) {
        throw new Error(`Failed to send data: ${response.status} ${response.statusText} ${await response.text()}`);
      }
    } catch (error) {
      console.error('Error:', error);
    }
    return response.json();
  }

  logOutput('postToTestomatio', originId ? `id:${originId}` : '', `${host}/${endpoint}`, JSON.stringify({
    data: {
      attributes: data,
      type,
    }
  }));

  try {
    response = await fetchWithRetry(() => fetch(`${host}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': jwtToken,
      },
      body: JSON.stringify({
        data: {
          origin_id: originId,
          attributes: data,
          type,
        }
      }),
    }));

  } catch (error) {
    console.error('Error:', error);
    return;
  }

  const json = await response.json();
  logOutput('postToTestomatio:response', json);
  const responseData = json.data;
  if (!responseData) return;
  responseData.alreadyReported = response.status === 208;
  if (responseData.alreadyReported) logOutput('already reported');
  return responseData;
}

export async function putToTestomatio(endpoint, type, id, data) {
  if (DRY_RUN) return;
  let response;
  logOutput('putToTestomatio', `${host}/${endpoint}/${id}`, JSON.stringify({
    data: {
      attributes: data,
      type,
    }
  }));

  try {
    response = await fetchWithRetry(() => fetch(`${host}/${endpoint}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': jwtToken,
      },
      body: JSON.stringify({
        data: {
          attributes: data,
          type,
        }
      }),
    }));

  } catch (error) {
    console.error('Error:', error);
    return;
  }

  const json = await response.json();
  return json.data;
}

export const uploadFile = async (testId, filePath, attachment) => {
  if (DRY_RUN) return;
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}, can't upload`);
    return;
  }

  try {
    const formData = new FormData();

    formData.append('file', new Blob([fs.readFileSync(filePath)]), attachment.name);
    const url = getTestomatioEndpoints().postAttachmentEndpoint.replace(':tid', testId);

    const response = await fetchWithRetry(() => fetch(host + url, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': jwtToken,
      },
    }));

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.status} ${response.statusText} ${host + url}`);
    }

    const json = await response.json();
    logOutput(`File ${filePath} uploaded to ${testId} as ${json.url}`);
    return json.url;
  } catch (error) {
    console.error('Error uploading file:', error);
  }
};

export async function deleteEmptySuites() {
  if (DRY_RUN) return;
  try {
    await fetch(`${host}${getTestomatioEndpoints().deleteEmptySuitesEndpoint}`, {
      method: 'DELETE',
      headers: {
        'Authorization': jwtToken,
      },
    });

    await fetch(`${host}${getTestomatioEndpoints().syncEndpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': jwtToken,
      },
    });

  } catch (error) {
    // console.error('Error deleting empty suites:', error);
  }
}

async function fetchWithRetry(func, maxRetries = 3, retryDelay = 2000) {
  let retryCount = 0;
  while (retryCount < maxRetries) {
    try {
      const response = await func();
      if (response.status !== 429) {
        return response;
      }
      console.log(`Rate limit reached. Waiting for ${retryDelay / 1000} seconds before retrying...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      retryCount++;
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }


  if (!response.ok) {
    throw new Error(`Failed to send data: ${response.status} ${response.statusText} ${await response.text()}`);
  }
}
