import Papa from 'papaparse';

export function parseTasksFromCSV(csvText: string): any[] {
  try {
    // Use Papa Parse for better CSV handling
    const result = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase()
    });

    if (result.errors.length > 0) {
      console.warn('CSV parsing warnings:', result.errors);
    }

    const tasks = result.data.map((row: any) => {
      const task: any = {};
      
      // Handle date - try multiple formats
      const dateValue = row.date || row.Date;
      if (dateValue) {
        // Handle M/D/YYYY format
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
      
      // Handle activity/task
      task.activity = row.activity || row.task || row.title || '';
      
      // Handle notes/description
      task.notes = row.notes || row.description || '';
      
      // Handle priority - convert Google Sheets format
      let priority = row.priority || '';
      if (priority) {
        // Normalize priority values
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
      
      // Handle status - check Result column for TRUE/FALSE or status
      const result = row.result || row.status || '';
      if (result.toString().toLowerCase() === 'true' || result.toLowerCase() === 'completed') {
        task.status = 'completed';
      } else if (result.toString().toLowerCase() === 'false') {
        task.status = 'pending';
      } else {
        task.status = 'pending';
      }
      
      // Handle star ratings (☆☆☆☆☆) - convert to numbers
      const parseStarRating = (value: string): number | null => {
        if (!value) return null;
        const starCount = (value.match(/★/g) || []).length;
        return starCount >= 1 && starCount <= 5 ? starCount : null;
      };
      
      task.urgency = parseStarRating(row.urgency) || parseIntegerValue(row.urgency);
      task.impact = parseStarRating(row.impact) || parseIntegerValue(row.impact);
      task.effort = parseStarRating(row.effort) || parseIntegerValue(row.effort);
      
      // Handle prerequisites
      task.prerequisites = row.prerequisites || row['pre-reqs'] || '';
      
      return task;
    });
    
    // Filter out tasks without activity
    return tasks.filter(task => task.activity && task.activity.trim());
    
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return [];
  }
}

function parseIntegerValue(value: any): number | null {
  const num = parseInt(value);
  return !isNaN(num) && num >= 1 && num <= 5 ? num : null;
}

export function parseTasksFromExcel(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // For now, treat Excel files as CSV since we don't have xlsx on client
        // In a real implementation, you'd use xlsx library
        const text = e.target?.result as string;
        const tasks = parseTasksFromCSV(text);
        resolve(tasks);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function tasksToCSV(tasks: any[]): string {
  if (tasks.length === 0) return '';
  
  // Define headers that match your Google Sheets format
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
    'Impact',
    'Time Start',
    'Time End',
    'Subtypes'
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
    '', // Sub-Priority
    '', // Impact (duplicate column)
    '', // Time Start
    '', // Time End
    ''  // Subtypes
  ]);
  
  return Papa.unparse({
    fields: headers,
    data: rows
  });
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