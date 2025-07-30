
function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== "Daily Planner") return;

  const range = e.range;
  const row = range.getRow();
  const col = range.getColumn();

  if ((col === 4 || col === 5) && row > 1) {
    calculatePriority(sheet, row);
  }
}

function calculatePriority(sheet, row) {
  try {
    const activity = (sheet.getRange(row, 4).getValue() || "").toString().toLowerCase();
    const notes = (sheet.getRange(row, 5).getValue() || "").toString().toLowerCase();
    const combined = activity + " " + notes;
    if (!combined.trim()) return;

    let score = 0;

    const criticalKeywords = {
      "submit": 4, "deadline": 4, "urgent": 4, "license": 4, "confirm": 3,
      "install": 3, "fix": 3, "setup": 3, "configure": 3, "coord": 3,
      "meeting": 2, "call": 2, "follow": 2, "email": 2, "share": 2,
      "plan": 1, "research": 1, "review": 1, "update": 1
    };

    Object.keys(criticalKeywords).forEach(keyword => {
      if (combined.includes(keyword)) score += criticalKeywords[keyword];
    });

    if (combined.includes("@urgent") || combined.includes("#urgent")) score += 5;
    if (combined.includes("@blocker") || combined.includes("#blocker")) score += 4;
    if (combined.includes("@followup") || combined.includes("#followup")) score += 2;

    const timeKeywords = ["today", "tomorrow", "asap", "immediately", "now"];
    timeKeywords.forEach(keyword => {
      if (combined.includes(keyword)) score += 3;
    });

    if (combined.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/)) {
      score += 2;
    }

    if (isRepeatedTask(sheet, combined, row)) {
      score -= 1;
    }

    const problemKeywords = ["error", "issue", "problem", "broken", "failed", "won't", "can't", "doesn't"];
    problemKeywords.forEach(keyword => {
      if (combined.includes(keyword)) score += 3;
    });

    let priority = "Low";
    if (score >= 8) priority = "Highest";
    else if (score >= 6) priority = "High";
    else if (score >= 4) priority = "Medium-High";
    else if (score >= 2) priority = "Medium";

    sheet.getRange(row, 2).setValue(priority);
  } catch (error) {
    console.error("Error in calculatePriority:", error);
  }
}

function isRepeatedTask(sheet, currentTask, currentRow) {
  try {
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const startRow = Math.max(1, currentRow - 30);
    let repeatCount = 0;

    for (let i = startRow; i < currentRow - 1; i++) {
      if (i < values.length) {
        const pastActivity = (values[i][3] || "").toString().toLowerCase();
        const pastNotes = (values[i][4] || "").toString().toLowerCase();
        const pastCombined = pastActivity + " " + pastNotes;

        if (pastCombined && calculateSimilarity(currentTask, pastCombined) > 0.7) {
          repeatCount++;
        }
      }
    }

    return repeatCount > 2;
  } catch (error) {
    console.error("Error in isRepeatedTask:", error);
    return false;
  }
}

function calculateSimilarity(str1, str2) {
  const words1 = new Set(str1.split(' '));
  const words2 = new Set(str2.split(' '));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

function recalculateAllPriorities() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  for (let row = 2; row <= lastRow; row++) {
    const activity = sheet.getRange(row, 4).getValue();
    if (activity) {
      calculatePriority(sheet, row);
    }
  }
  SpreadsheetApp.getUi().alert('Priority recalculation complete!');
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Task Automation')
    .addItem('Recalculate All Priorities', 'recalculateAllPriorities')
    .addItem('Clear All Priorities', 'clearAllPriorities')
    .addToUi();
}

function clearAllPriorities() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  sheet.getRange(2, 2, lastRow - 1, 1).clearContent();
  SpreadsheetApp.getUi().alert('All priorities cleared!');
}
