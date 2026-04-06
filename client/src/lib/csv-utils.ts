import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { formatAxTaskCsvAttribution } from '@shared/attribution';

function excelDateToString(serial: number): string {
  if (!serial || typeof serial !== 'number' || serial < 1) return '';
  const utcDays = Math.floor(serial) - 25569;
  const d = new Date(utcDays * 86400 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseIntegerValue(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = parseInt(String(value));
  return !isNaN(num) && num >= 0 && num <= 5 ? (num === 0 ? null : num) : null;
}

function parseStarRating(value: string): number | null {
  if (!value || value === '☆☆☆☆☆') return null;
  const starCount = (value.match(/★/g) || []).length;
  return starCount >= 1 && starCount <= 5 ? starCount : null;
}

interface ParsedSheetResult {
  sheetName: string;
  tasks: any[];
  rowCount: number;
}

export function parseTasksFromExcel(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const allTasks: any[] = [];

        const importSheets = [
          'Daily Planner 2026',
          'Archive 2025',
          'Archive 2024',
          'Vault',
        ];

        for (const sheetName of importSheets) {
          if (!workbook.SheetNames.includes(sheetName)) continue;
          const sheet = workbook.Sheets[sheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          if (rows.length < 2) continue;

          const headers = (rows[0] || []).map((h: any) =>
            String(h || '').trim().toLowerCase()
          );

          if (sheetName === 'Vault') {
            const parsed = parseVaultRows(rows, headers);
            allTasks.push(...parsed);
          } else {
            const parsed = parsePlannerRows(rows, headers, sheetName);
            allTasks.push(...parsed);
          }
        }

        resolve(allTasks);
      } catch (error) {
        console.error('Excel parse error:', error);
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function parseExcelSheetInfo(file: File): Promise<ParsedSheetResult[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const results: ParsedSheetResult[] = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          if (rows.length < 2) continue;
          const headers = (rows[0] || []).map((h: any) => String(h || '').trim().toLowerCase());

          let tasks: any[] = [];
          if (sheetName === 'Vault') {
            tasks = parseVaultRows(rows, headers);
          } else if (sheetName === 'README' || sheetName === 'Roadmap' || sheetName === 'Scripts') {
            continue;
          } else {
            tasks = parsePlannerRows(rows, headers, sheetName);
          }

          if (tasks.length > 0) {
            results.push({ sheetName, tasks, rowCount: tasks.length });
          }
        }
        resolve(results);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

function findCol(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.indexOf(c.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function cellVal(row: any[], idx: number): any {
  return idx >= 0 && idx < row.length ? row[idx] : undefined;
}

function parsePlannerRows(rows: any[][], headers: string[], sheetName: string): any[] {
  const dateIdx = findCol(headers, 'date');
  const activityIdx = findCol(headers, 'activity');
  const notesIdx = findCol(headers, 'notes');
  const urgencyIdx = findCol(headers, 'urgency');
  const impactIdx = findCol(headers, 'impact');
  const effortIdx = findCol(headers, 'effort');
  const resultIdx = findCol(headers, 'result');
  const prereqIdx = findCol(headers, 'pre-reqs', 'prerequisites');
  const priorityIdx = findCol(headers, 'priority', '#ref!');
  const timeStartIdx = findCol(headers, 'time start');
  const timeEndIdx = findCol(headers, 'time end');

  const tasks: any[] = [];
  let lastDate = '';

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    let activity = cellVal(row, activityIdx);
    if (activity === null || activity === undefined || String(activity).trim() === '') continue;
    activity = String(activity).trim();

    if (activity === 'Activity' || activity === 'Date') continue;

    let dateStr = '';
    const rawDate = cellVal(row, dateIdx);
    if (typeof rawDate === 'number' && rawDate > 1000) {
      dateStr = excelDateToString(rawDate);
    } else if (typeof rawDate === 'string' && rawDate.trim()) {
      if (rawDate.includes('/')) {
        const parts = rawDate.split('/');
        if (parts.length === 3) {
          dateStr = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        }
      } else if (rawDate.includes('-')) {
        dateStr = rawDate;
      }
    }

    if (!dateStr && lastDate) {
      dateStr = lastDate;
    }
    if (!dateStr) {
      dateStr = new Date().toISOString().split('T')[0];
    }
    lastDate = dateStr;

    const notes = cellVal(row, notesIdx);
    const rawResult = cellVal(row, resultIdx);
    const status = (rawResult === true || String(rawResult).toLowerCase() === 'true')
      ? 'completed' : 'pending';

    const urgency = parseIntegerValue(cellVal(row, urgencyIdx));
    const impact = parseIntegerValue(cellVal(row, impactIdx));
    const effort = parseIntegerValue(cellVal(row, effortIdx));
    const prerequisites = cellVal(row, prereqIdx);

    const task: any = {
      date: dateStr,
      activity: activity,
      notes: notes ? String(notes) : '',
      status,
    };

    if (urgency) task.urgency = urgency;
    if (impact) task.impact = impact;
    if (effort) task.effort = effort;
    if (prerequisites) task.prerequisites = String(prerequisites);

    tasks.push(task);
  }

  return tasks;
}

function parseVaultRows(rows: any[][], headers: string[]): any[] {
  const keyIdx = findCol(headers, 'key');
  const categoryIdx = findCol(headers, 'category');
  const itemIdx = findCol(headers, 'item');
  const notesIdx = findCol(headers, 'notes');
  const sourceDateIdx = findCol(headers, 'source date');

  const tasks: any[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const item = cellVal(row, itemIdx);
    if (!item || String(item).trim() === '') continue;

    let dateStr = '';
    const rawDate = cellVal(row, sourceDateIdx);
    if (typeof rawDate === 'number' && rawDate > 1000) {
      dateStr = excelDateToString(rawDate);
    }
    if (!dateStr) dateStr = new Date().toISOString().split('T')[0];

    const notes = cellVal(row, notesIdx);
    const category = cellVal(row, categoryIdx);
    const key = cellVal(row, keyIdx);

    const noteParts = [];
    if (notes) noteParts.push(String(notes));
    if (category) noteParts.push(`[Vault: ${category}]`);
    if (key) noteParts.push(`[Key: ${key}]`);

    tasks.push({
      date: dateStr,
      activity: String(item).trim(),
      notes: noteParts.join('\n'),
      status: 'pending',
    });
  }

  return tasks;
}

/** Removes leading # comment lines (before the header row) so CSV re-import after export stays clean. */
export function stripCsvAttributionLines(csvText: string): string {
  const lines = csvText.split("\n");
  let i = 0;
  while (i < lines.length && /^\s*#/.test(lines[i] ?? "")) {
    i += 1;
  }
  return lines.slice(i).join("\n");
}

export function parseTasksFromCSV(csvText: string): any[] {
  try {
    const result = Papa.parse(stripCsvAttributionLines(csvText), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase()
    });

    if (result.errors.length > 0) {
      console.warn('CSV parsing warnings:', result.errors);
    }

    const tasks = result.data.map((row: any) => {
      const task: any = {};

      const dateValue = row.date || row.Date;
      if (dateValue) {
        const dateParts = dateValue.split('/');
        if (dateParts.length === 3) {
          const month = dateParts[0].padStart(2, '0');
          const day = dateParts[1].padStart(2, '0');
          const year = dateParts[2];
          task.date = `${year}-${month}-${day}`;
        } else {
          task.date = dateValue;
        }
      } else {
        task.date = new Date().toISOString().split('T')[0];
      }

      task.activity = row.activity || row.task || row.title || '';
      task.notes = row.notes || row.description || '';

      let priority = row.priority || '';
      if (priority) {
        priority = priority.toLowerCase();
        if (priority.includes('highest') || priority.includes('urgent')) {
          task.priority = 'Highest';
        } else if (priority.includes('high')) {
          task.priority = 'High';
        } else if (priority.includes('medium-high')) {
          task.priority = 'Medium-High';
        } else if (priority.includes('medium')) {
          task.priority = 'Medium';
        } else if (priority.includes('low')) {
          task.priority = 'Low';
        }
      }

      const resultVal = row.result || row.status || '';
      if (resultVal.toString().toLowerCase() === 'true' || resultVal.toLowerCase() === 'completed') {
        task.status = 'completed';
      } else if (resultVal.toString().toLowerCase() === 'false') {
        task.status = 'pending';
      } else {
        task.status = 'pending';
      }

      task.urgency = parseStarRating(row.urgency) || parseIntegerValue(row.urgency) || 3;
      task.impact = parseStarRating(row.impact) || parseIntegerValue(row.impact) || 3;
      task.effort = parseStarRating(row.effort) || parseIntegerValue(row.effort) || 3;

      task.prerequisites = row.prerequisites || row['pre-reqs'] || '';

      return task;
    });

    return tasks.filter(task => task.activity && task.activity.trim());

  } catch (error) {
    console.error('Error parsing CSV:', error);
    return [];
  }
}

export function tasksToCSV(tasks: any[]): string {
  if (tasks.length === 0) return '';

  const headers = [
    'Date',
    'Priority',
    'Result',
    'Activity',
    'Notes',
    'Urgency',
    'Impact',
    'Effort',
    'Pre-Reqs',
    'Sub-Priority',
    'Time Start',
    'Time End',
    'Subtypes',
  ];

  const rows = tasks.map(task => [
    task.date || '',
    task.priority || '',
    task.status === 'completed' ? 'TRUE' : 'FALSE',
    task.activity || '',
    task.notes || '',
    task.urgency ? '★'.repeat(task.urgency) + '☆'.repeat(5 - task.urgency) : '☆☆☆☆☆',
    task.impact ? '★'.repeat(task.impact) + '☆'.repeat(5 - task.impact) : '☆☆☆☆☆',
    task.effort ? '★'.repeat(task.effort) + '☆'.repeat(5 - task.effort) : '☆☆☆☆☆',
    task.prerequisites || '',
    '',
    '',
    '',
    '',
  ]);

  const body = Papa.unparse({
    fields: headers,
    data: rows,
  });
  return `${formatAxTaskCsvAttribution()}\n${body}`;
}

export function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
