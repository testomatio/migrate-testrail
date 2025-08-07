import "dotenv/config";
import debug from "debug";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import crypto from "crypto";
import {
  configureTestomatio,
  loginToTestomatio,
  fetchFromTestomatio,
  putToTestomatio,
  uploadFile,
  getTestomatioEndpoints,
} from "./testomatio.js";

const logData = debug("testomatio:attachment-fix");

// Check for dry run mode (command line flag only)
const DRY_RUN = process.argv.includes("--dry-run");

// Configure from environment variables
configureTestomatio(
  process.env.TESTOMATIO_TOKEN,
  process.env.TESTOMATIO_HOST || "https://app.testomat.io",
  process.env.TESTOMATIO_PROJECT,
);

const TESTRAIL_URL = process.env.TESTRAIL_URL;
const TESTRAIL_SESSION = process.env.TESTRAIL_SESSION;

if (!TESTRAIL_URL || !TESTRAIL_SESSION) {
  throw new Error(
    "Missing required environment variables: TESTRAIL_URL and TESTRAIL_SESSION",
  );
}

const RUN_TIME = +new Date();

/**
 * Download attachment from TestRail using session cookie
 * @param {string} attachmentPath - The attachment path (e.g., 'index.php?/attachments/get/123')
 * @param {string} filename - Optional filename for the downloaded file
 * @returns {Promise<string|null>} - Path to downloaded file or null if failed
 */
async function downloadAttachmentFromTestRail(attachmentPath, filename = "") {
  try {
    // Construct full URL
    const fullUrl = TESTRAIL_URL + attachmentPath;
    logData(`Downloading attachment from ${fullUrl}`);

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would download attachment from: ${fullUrl}`);
      return "/tmp/dry-run-fake-file";
    }

    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        Cookie: `tr_session=${TESTRAIL_SESSION}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch attachment: ${response.status} ${response.statusText}`,
      );
    }

    // Generate filename if not provided
    if (!filename) {
      filename = crypto.createHash("sha1").update(attachmentPath).digest("hex");
    }

    const tempFilePath = path.join(
      tmpdir(),
      `fix-attachment-${RUN_TIME}-${filename}`,
    );
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    // Save file
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempFilePath, Buffer.from(buffer));

    logData(`Attachment downloaded to ${tempFilePath}`);
    return tempFilePath;
  } catch (error) {
    console.error("Error downloading attachment:", error);
    return null;
  }
}

/**
 * Search for tests containing orphaned attachment URLs
 * @returns {Promise<Array>} Array of tests with orphaned attachment URLs
 */
async function searchTestsWithOrphanedAttachments() {
  try {
    const { postTestEndpoint } = getTestomatioEndpoints();

    let allTests = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const listEndpoint = `${postTestEndpoint}?detail=true&page=${currentPage}`;

      logData(`Listing all tests (page ${currentPage})`);
      const response = await fetchFromTestomatio(listEndpoint);

      if (!response || !response.data) {
        break;
      }

      const currentTests = response.data.filter((test) =>
        test.attributes.description?.includes("index.php?/attachments/get/"),
      );

      // Add tests from current page
      allTests = allTests.concat(currentTests);

      logData(`+${currentTests.length} tests with broken attachments`);

      // Update pagination info
      if (response.meta) {
        totalPages = response.meta.total_pages || 1;
        logData(
          `Page ${currentPage} of ${totalPages}, found ${currentTests.length} tests (${response.meta.num} total)`,
        );
      }

      currentPage++;
    } while (currentPage <= totalPages);

    logData(`Total tests found across all pages: ${allTests.length}`);

    if (allTests.length === 0) {
      console.log("No tests found with orphaned attachment URLs");
    }

    return allTests;
  } catch (error) {
    console.error("Error searching for tests:", error);
    return [];
  }
}

/**
 * Extract attachment URLs from test description
 * @param {string} description - Test description content
 * @returns {Array<string>} Array of attachment URLs found
 */
function extractAttachmentUrls(description) {
  if (!description) return [];

  // Match patterns like index.php?/attachments/get/123 or index.php?/attachments/get/abc-def-123
  const urlPattern = /(index\.php\?\/attachments\/get\/[\w-]+)/g;
  const matches = description.match(urlPattern) || [];

  return [...new Set(matches)]; // Remove duplicates
}

/**
 * Fix orphaned attachment URLs in a single test
 * @param {Object} test - Test object from Testomat.io
 * @returns {Promise<boolean>} True if test was updated, false otherwise
 */
async function fixTestAttachments(test) {
  try {
    const testId = test.id;
    const description = test.attributes.description || "";
    const title = test.attributes.title || "Unknown Test";

    logData(`Processing test: ${title} (ID: ${testId})`);

    // Extract attachment URLs from description
    const attachmentUrls = extractAttachmentUrls(description);

    if (attachmentUrls.length === 0) {
      logData(`No attachment URLs found in test ${testId}`);
      return false;
    }

    console.log(
      `Found ${attachmentUrls.length} attachment URLs in test: ${title}`,
    );

    if (DRY_RUN) {
      console.log(
        `[DRY RUN] Would process ${attachmentUrls.length} attachments:`,
      );
      attachmentUrls.forEach((url, index) => {
        console.log(`  ${index + 1}. ${url}`);
      });
      return false;
    }

    let updatedDescription = description;
    let hasUpdates = false;

    // Process each attachment URL
    for (const attachmentUrl of attachmentUrls) {
      try {
        logData(`Processing attachment URL: ${attachmentUrl}`);

        // Generate a filename for the attachment
        const attachmentId = attachmentUrl.split("/").pop();
        const filename = `attachment_${attachmentId}`;

        // Download attachment from TestRail
        const filePath = await downloadAttachmentFromTestRail(
          attachmentUrl,
          filename,
        );

        if (!filePath) {
          console.log(`Failed to download attachment: ${attachmentUrl}`);
          continue;
        }

        // Upload to Testomat.io
        const attachmentData = { name: filename };
        const newUrl = await uploadFile(testId, filePath, attachmentData);

        if (newUrl) {
          // Replace the old URL with the new one in description
          updatedDescription = updatedDescription.replaceAll(
            attachmentUrl,
            newUrl,
          );
          hasUpdates = true;
          logData(`Replaced ${attachmentUrl} with ${newUrl}`);
        } else {
          console.log(
            `Failed to upload attachment to Testomat.io: ${attachmentUrl}`,
          );
        }

        // Clean up temporary file
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error(`Error processing attachment ${attachmentUrl}:`, error);
      }
    }

    // Update test description if there were changes
    if (hasUpdates) {
      const { postTestEndpoint } = getTestomatioEndpoints();
      await putToTestomatio(postTestEndpoint, "tests", testId, {
        description: updatedDescription,
      });

      console.log(`✓ Updated test: ${title}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error fixing attachments for test ${test.id}:`, error);
    return false;
  }
}

/**
 * Main function to fix orphaned attachment URLs
 */
async function migrateAttachments() {
  try {
    console.log("Starting orphaned attachment URL fix process...");

    if (DRY_RUN) {
      console.log(
        "🔍 DRY RUN MODE - No changes will be made, analyzing only...\n",
      );
    }

    // Login to Testomat.io
    console.log("Logging in to Testomat.io...");
    await loginToTestomatio();

    // Search for tests with orphaned attachment URLs
    console.log("Searching for tests with orphaned attachment URLs...");
    const tests = await searchTestsWithOrphanedAttachments();

    if (tests.length === 0) {
      console.log("No tests found with orphaned attachment URLs");
      return;
    }

    console.log(`Found ${tests.length} tests matching search criteria`);

    // Filter tests to only process those with actual orphaned attachments
    const testsWithAttachments = tests.filter((test) => {
      const description = test.attributes.description || "";
      return extractAttachmentUrls(description).length > 0;
    });

    if (testsWithAttachments.length === 0) {
      console.log(
        "No tests found with actual orphaned attachment URLs in descriptions",
      );
      return;
    }

    // Count total attachments for summary
    const totalAttachments = testsWithAttachments.reduce((total, test) => {
      const description = test.attributes.description || "";
      return total + extractAttachmentUrls(description).length;
    }, 0);

    console.log(
      `Found ${testsWithAttachments.length} tests with ${totalAttachments} orphaned attachments`,
    );

    if (DRY_RUN) {
      console.log("\n=== DRY RUN ANALYSIS ===");
      console.log(
        `📊 ${testsWithAttachments.length} tests would be updated with ${totalAttachments} attachment(s) migrated`,
      );
      console.log("🚀 Remove --dry-run flag to execute actual migration");
      return;
    }

    console.log(
      `Processing ${testsWithAttachments.length} tests with orphaned attachments...`,
    );

    let updatedCount = 0;

    // Process each test
    for (const test of testsWithAttachments) {
      const wasUpdated = await fixTestAttachments(test);
      if (wasUpdated) {
        updatedCount++;
      }

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(
      `\n✓ Process completed. Updated ${updatedCount} out of ${testsWithAttachments.length} tests.`,
    );
  } catch (error) {
    console.error("Error in migrateAttachments:", error);
  }
}

// Allow running as standalone script
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  migrateAttachments();
}

export default migrateAttachments;
