
import { Router } from 'express';
import { createGoogleSheetsAPI } from '../google-sheets-api';
import { getConfigurationGuide } from '../config/google-sheets-config';
import { storage } from '../storage';

export const googleSheetsRouter = Router();

// Configuration status endpoint
googleSheetsRouter.get('/config-status', (req, res) => {
  const guide = getConfigurationGuide();
  res.json(guide);
});

// Generate OAuth URL
googleSheetsRouter.get('/auth-url', async (req, res) => {
  try {
    const guide = getConfigurationGuide();
    
    if (!guide.isConfigured) {
      return res.status(400).json({ 
        message: 'Google API credentials not configured',
        guide
      });
    }

    const googleSheets = createGoogleSheetsAPI();
    const authUrl = googleSheets.generateAuthUrl();
    
    res.json({ 
      authUrl,
      redirectUri: guide.redirectUri
    });
  } catch (error: any) {
    res.status(500).json({ 
      message: 'Failed to generate auth URL',
      error: error.message 
    });
  }
});

// Handle OAuth callback
googleSheetsRouter.post('/auth-callback', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: 'Authorization code required' });
    }

    const googleSheets = createGoogleSheetsAPI();
    const tokens = await googleSheets.getTokens(code);
    
    res.json({ 
      message: 'Authentication successful',
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });
  } catch (error: any) {
    res.status(500).json({ 
      message: 'Failed to exchange authorization code',
      error: error.message 
    });
  }
});

// Get spreadsheet info
googleSheetsRouter.get('/spreadsheet/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { accessToken, refreshToken } = req.query;

    if (!accessToken) {
      return res.status(400).json({ message: 'Access token required' });
    }

    const googleSheets = createGoogleSheetsAPI({
      accessToken: accessToken as string,
      refreshToken: refreshToken as string
    });

    const info = await googleSheets.getSpreadsheetInfo(id);
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ 
      message: 'Failed to get spreadsheet info',
      error: error.message 
    });
  }
});

// Create spreadsheet
googleSheetsRouter.post('/create-spreadsheet', async (req, res) => {
  try {
    const { title, accessToken, refreshToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ message: 'Access token required' });
    }

    const googleSheets = createGoogleSheetsAPI({
      accessToken,
      refreshToken
    });

    const spreadsheetId = await googleSheets.createTaskSpreadsheet(title);
    res.json({ 
      spreadsheetId,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    });
  } catch (error: any) {
    res.status(500).json({ 
      message: 'Failed to create spreadsheet',
      error: error.message 
    });
  }
});

// Export tasks
googleSheetsRouter.post('/export', async (req, res) => {
  try {
    const { spreadsheetId, sheetName, accessToken, refreshToken } = req.body;

    if (!spreadsheetId || !accessToken) {
      return res.status(400).json({ message: 'Spreadsheet ID and access token required' });
    }

    const googleSheets = createGoogleSheetsAPI({
      accessToken,
      refreshToken
    });

    const tasks = await storage.getTasks();
    const result = await googleSheets.exportTasks(spreadsheetId, tasks, sheetName);
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ 
      message: 'Failed to export tasks',
      error: error.message 
    });
  }
});

// Import tasks
googleSheetsRouter.post('/import', async (req, res) => {
  try {
    const { spreadsheetId, sheetName, accessToken, refreshToken } = req.body;

    if (!spreadsheetId || !accessToken) {
      return res.status(400).json({ message: 'Spreadsheet ID and access token required' });
    }

    const googleSheets = createGoogleSheetsAPI({
      accessToken,
      refreshToken
    });

    const importedTasks = await googleSheets.importTasks(spreadsheetId, sheetName);
    
    // Store imported tasks
    let imported = 0;
    for (const task of importedTasks) {
      try {
        await storage.createTask(task);
        imported++;
      } catch (error) {
        console.warn('Failed to import task:', error);
      }
    }
    
    res.json({ 
      imported, 
      total: importedTasks.length,
      message: `Successfully imported ${imported} of ${importedTasks.length} tasks`
    });
  } catch (error: any) {
    res.status(500).json({ 
      message: 'Failed to import tasks',
      error: error.message 
    });
  }
});

// Sync tasks
googleSheetsRouter.post('/sync', async (req, res) => {
  try {
    const { spreadsheetId, sheetName, accessToken, refreshToken } = req.body;

    if (!spreadsheetId || !accessToken) {
      return res.status(400).json({ message: 'Spreadsheet ID and access token required' });
    }

    const googleSheets = createGoogleSheetsAPI({
      accessToken,
      refreshToken
    });

    const localTasks = await storage.getTasks();
    const syncResult = await googleSheets.syncTasks(spreadsheetId, localTasks, sheetName);
    
    res.json({
      message: 'Sync completed',
      exported: syncResult.exported,
      conflicts: syncResult.conflicts.length,
      conflictDetails: syncResult.conflicts
    });
  } catch (error: any) {
    res.status(500).json({ 
      message: 'Failed to sync with Google Sheets',
      error: error.message 
    });
  }
});
