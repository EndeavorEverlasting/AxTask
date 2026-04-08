/**
 * NodeWeaver Google Apps Script Integration
 * Automatic task categorization for Google Sheets
 * 
 * Installation Instructions:
 * 1. Open Google Apps Script (script.google.com)
 * 2. Create a new project
 * 3. Replace the default code with this script
 * 4. Set NODEWEAVER_API_URL in the configuration section
 * 5. Save and authorize the necessary permissions
 * 6. Use the functions in your Google Sheets
 */

// Configuration
const CONFIG = {
  NODEWEAVER_API_URL: 'https://your-nodeweaver-domain.com/api/v1',
  CACHE_DURATION: 3600, // 1 hour in seconds
  MAX_RETRIES: 3,
  TIMEOUT: 30000, // 30 seconds
  BATCH_SIZE: 50 // Maximum texts to process in one batch
};

/**
 * Classify a single task/text using NodeWeaver API
 * Usage in sheets: =CLASSIFY_TASK("Schedule dentist appointment")
 * 
 * @param {string} text - The text to classify
 * @param {Object} metadata - Optional metadata object
 * @return {string} The predicted category
 */
function CLASSIFY_TASK(text, metadata = {}) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return 'ERROR: Invalid text input';
  }

  // Check cache first
  const cacheKey = `classify_${Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text).toString()}`;
  const cached = CacheService.getScriptCache().get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = makeApiRequest('/classify', 'POST', {
      text: text.trim(),
      metadata: metadata
    });

    const category = response.predicted_category || 'other';
    
    // Cache the result
    CacheService.getScriptCache().put(cacheKey, category, CONFIG.CACHE_DURATION);
    
    return category;
  } catch (error) {
    Logger.log(`Classification error: ${error.toString()}`);
    return `ERROR: ${error.toString()}`;
  }
}

/**
 * Get confidence score for a classification
 * Usage: =CLASSIFY_CONFIDENCE("Buy groceries")
 * 
 * @param {string} text - The text to classify
 * @return {number} Confidence score (0-1)
 */
function CLASSIFY_CONFIDENCE(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return 0;
  }

  try {
    const response = makeApiRequest('/classify', 'POST', {
      text: text.trim()
    });

    return response.confidence_score || 0;
  } catch (error) {
    Logger.log(`Confidence error: ${error.toString()}`);
    return 0;
  }
}

/**
 * Classify multiple tasks in batch
 * Usage: =CLASSIFY_BATCH(A1:A10) where A1:A10 contains tasks
 * 
 * @param {Array} range - Range of cells containing texts to classify
 * @return {Array} Array of categories corresponding to input texts
 */
function CLASSIFY_BATCH(range) {
  if (!Array.isArray(range)) {
    return 'ERROR: Input must be a range of cells';
  }

  const texts = range.flat().filter(text => 
    text && typeof text === 'string' && text.trim().length > 0
  );

  if (texts.length === 0) {
    return 'ERROR: No valid texts found';
  }

  try {
    const results = [];
    
    // Process in batches to avoid API limits
    for (let i = 0; i < texts.length; i += CONFIG.BATCH_SIZE) {
      const batch = texts.slice(i, i + CONFIG.BATCH_SIZE);
      const response = makeApiRequest('/classify/batch', 'POST', {
        texts: batch
      });

      if (response.results) {
        results.push(...response.results.map(r => r.predicted_category || 'other'));
      }
    }

    return results;
  } catch (error) {
    Logger.log(`Batch classification error: ${error.toString()}`);
    return `ERROR: ${error.toString()}`;
  }
}

/**
 * Auto-categorize tasks in a sheet
 * This function can be triggered automatically or manually
 * 
 * @param {string} sheetName - Name of the sheet to process
 * @param {string} textColumn - Column letter containing text (e.g., 'A')
 * @param {string} categoryColumn - Column letter for categories (e.g., 'B')
 * @param {number} startRow - Starting row number (default: 2)
 */
function AUTO_CATEGORIZE_SHEET(sheetName = null, textColumn = 'A', categoryColumn = 'B', startRow = 2) {
  try {
    const sheet = sheetName ? 
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName) :
      SpreadsheetApp.getActiveSheet();
    
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < startRow) {
      Logger.log('No data to process');
      return;
    }

    // Get text data
    const textRange = sheet.getRange(`${textColumn}${startRow}:${textColumn}${lastRow}`);
    const texts = textRange.getValues().flat();

    // Get existing categories to avoid re-processing
    const categoryRange = sheet.getRange(`${categoryColumn}${startRow}:${categoryColumn}${lastRow}`);
    const existingCategories = categoryRange.getValues().flat();

    // Find texts that need categorization
    const textsToProcess = [];
    const indicesToUpdate = [];

    texts.forEach((text, index) => {
      if (text && text.toString().trim() && !existingCategories[index]) {
        textsToProcess.push(text.toString().trim());
        indicesToUpdate.push(index);
      }
    });

    if (textsToProcess.length === 0) {
      Logger.log('All tasks already categorized');
      return;
    }

    Logger.log(`Processing ${textsToProcess.length} tasks...`);

    // Process in batches
    const newCategories = [];
    for (let i = 0; i < textsToProcess.length; i += CONFIG.BATCH_SIZE) {
      const batch = textsToProcess.slice(i, i + CONFIG.BATCH_SIZE);
      const response = makeApiRequest('/classify/batch', 'POST', {
        texts: batch
      });

      if (response.results) {
        newCategories.push(...response.results.map(r => r.predicted_category || 'other'));
      }
    }

    // Update the sheet
    indicesToUpdate.forEach((index, i) => {
      if (newCategories[i]) {
        sheet.getRange(`${categoryColumn}${startRow + index}`).setValue(newCategories[i]);
      }
    });

    Logger.log(`Successfully categorized ${newCategories.length} tasks`);
    
    // Show completion message
    SpreadsheetApp.getUi().alert(
      'Auto-categorization Complete',
      `Successfully categorized ${newCategories.length} tasks using TopicSense AI.`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (error) {
    Logger.log(`Auto-categorization error: ${error.toString()}`);
    SpreadsheetApp.getUi().alert(
      'Auto-categorization Error',
      `Failed to categorize tasks: ${error.toString()}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Get available categories from TopicSense
 * Usage: =GET_CATEGORIES() - returns categories as a column
 */
function GET_CATEGORIES() {
  try {
    const response = makeApiRequest('/categories', 'GET');
    return response.categories ? response.categories.map(cat => [cat]) : [['other']];
  } catch (error) {
    Logger.log(`Categories error: ${error.toString()}`);
    return [['ERROR: Unable to fetch categories']];
  }
}

/**
 * Train NodeWeaver with manual categorizations from the sheet
 * 
 * @param {string} sheetName - Name of the sheet containing training data
 * @param {string} textColumn - Column letter containing text
 * @param {string} categoryColumn - Column letter containing categories
 * @param {number} startRow - Starting row number
 */
function TRAIN_FROM_SHEET(sheetName = null, textColumn = 'A', categoryColumn = 'B', startRow = 2) {
  try {
    const sheet = sheetName ? 
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName) :
      SpreadsheetApp.getActiveSheet();
    
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < startRow) {
      throw new Error('No training data found');
    }

    // Get training data
    const textRange = sheet.getRange(`${textColumn}${startRow}:${textColumn}${lastRow}`);
    const categoryRange = sheet.getRange(`${categoryColumn}${startRow}:${categoryColumn}${lastRow}`);
    
    const texts = textRange.getValues().flat();
    const categories = categoryRange.getValues().flat();

    // Prepare training data
    const trainingData = [];
    texts.forEach((text, index) => {
      const category = categories[index];
      if (text && text.toString().trim() && category && category.toString().trim()) {
        trainingData.push({
          text: text.toString().trim(),
          category: category.toString().trim(),
          metadata: { source: 'google_sheets', sheet_name: sheet.getName() }
        });
      }
    });

    if (trainingData.length === 0) {
      throw new Error('No valid training data found');
    }

    Logger.log(`Training with ${trainingData.length} examples...`);

    const response = makeApiRequest('/train', 'POST', {
      training_data: trainingData
    });

    Logger.log(`Training completed: ${response.message}`);
    
    SpreadsheetApp.getUi().alert(
      'Training Complete',
      `Successfully trained NodeWeaver with ${trainingData.length} examples.\n\n${response.message}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (error) {
    Logger.log(`Training error: ${error.toString()}`);
    SpreadsheetApp.getUi().alert(
      'Training Error',
      `Failed to train model: ${error.toString()}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Create menu items for easy access to NodeWeaver functions
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('NodeWeaver')
    .addItem('Auto-Categorize Current Sheet', 'autoCategorizeCurrentSheet')
    .addSeparator()
    .addItem('Train from Current Sheet', 'trainFromCurrentSheet')
    .addItem('Show Available Categories', 'showCategories')
    .addSeparator()
    .addItem('API Configuration', 'showApiConfig')
    .addItem('Help & Documentation', 'showHelp')
    .addToUi();
}

// Menu helper functions
function autoCategorizeCurrentSheet() {
  AUTO_CATEGORIZE_SHEET();
}

function trainFromCurrentSheet() {
  TRAIN_FROM_SHEET();
}

function showCategories() {
  try {
    const response = makeApiRequest('/categories', 'GET');
    const categories = response.categories || ['other'];
    
    SpreadsheetApp.getUi().alert(
      'Available Categories',
      'TopicSense can classify tasks into these categories:\n\n' + categories.join(', '),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    SpreadsheetApp.getUi().alert('Error', `Failed to fetch categories: ${error.toString()}`);
  }
}

function showApiConfig() {
  SpreadsheetApp.getUi().alert(
    'API Configuration',
    `Current TopicSense API URL: ${CONFIG.TOPICSENSE_API_URL}\n\n` +
    'To change the API URL, edit the CONFIG object in the script editor.\n\n' +
    `Cache Duration: ${CONFIG.CACHE_DURATION} seconds\n` +
    `Batch Size: ${CONFIG.BATCH_SIZE} texts\n` +
    `Timeout: ${CONFIG.TIMEOUT}ms`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function showHelp() {
  const helpText = `
TopicSense Google Sheets Integration Help

Available Functions:
• =CLASSIFY_TASK("text") - Classify a single task
• =CLASSIFY_CONFIDENCE("text") - Get confidence score
• =CLASSIFY_BATCH(range) - Classify multiple tasks
• =GET_CATEGORIES() - List available categories

Menu Options:
• Auto-Categorize: Automatically categorize all uncategorized tasks
• Train from Sheet: Use your manual categorizations to improve the AI
• Show Categories: View available classification categories

Setup:
1. Make sure your NodeWeaver API is running
2. Update the API URL in script configuration
3. Authorize the script permissions when first used

For support, visit the NodeWeaver documentation.
  `;
  
  SpreadsheetApp.getUi().alert('NodeWeaver Help', helpText, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Make HTTP request to NodeWeaver API with retry logic
 * 
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {Object} payload - Request payload
 * @return {Object} API response
 */
function makeApiRequest(endpoint, method = 'GET', payload = null) {
  const url = CONFIG.NODEWEAVER_API_URL + endpoint;
  
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };

  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  let lastError;
  
  // Retry logic
  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();

      if (responseCode >= 200 && responseCode < 300) {
        return JSON.parse(responseText);
      } else {
        let errorMessage = `HTTP ${responseCode}`;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // Use default error message
        }
        
        throw new Error(errorMessage);
      }
    } catch (error) {
      lastError = error;
      Logger.log(`API request attempt ${attempt} failed: ${error.toString()}`);
      
      if (attempt < CONFIG.MAX_RETRIES) {
        // Exponential backoff
        Utilities.sleep(1000 * Math.pow(2, attempt - 1));
      }
    }
  }

  throw new Error(`API request failed after ${CONFIG.MAX_RETRIES} attempts: ${lastError.toString()}`);
}

/**
 * Test function to verify API connectivity
 */
function TEST_API_CONNECTION() {
  try {
    const response = makeApiRequest('/categories', 'GET');
    Logger.log('API connection successful');
    Logger.log(`Available categories: ${response.categories.join(', ')}`);
    
    SpreadsheetApp.getUi().alert(
      'API Connection Test',
      '✅ Successfully connected to TopicSense API!\n\n' +
      `Available categories: ${response.categories.join(', ')}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
    return true;
  } catch (error) {
    Logger.log(`API connection failed: ${error.toString()}`);
    
    SpreadsheetApp.getUi().alert(
      'API Connection Test',
      '❌ Failed to connect to TopicSense API.\n\n' +
      `Error: ${error.toString()}\n\n` +
      'Please check your API URL configuration.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
    return false;
  }
}
