
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type Task } from '@shared/schema';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge } from './priority-badge';
import { ClassificationBadge } from './classification-badge';
import { Search, ArrowUp, ArrowDown } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface QuickFindProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTask: (task: Task) => void;
}

export function QuickFind({ isOpen, onClose, onSelectTask }: QuickFindProps) {
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });

  const filteredTasks = tasks.filter(task =>
    task.activity.toLowerCase().includes(query.toLowerCase()) ||
    task.notes?.toLowerCase().includes(query.toLowerCase()) ||
    task.classification.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFocusedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [query]);

  useEffect(() => {
    // Scroll focused item into view
    if (resultsRef.current) {
      const focusedElement = resultsRef.current.children[focusedIndex] as HTMLElement;
      focusedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => Math.min(prev + 1, filteredTasks.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filteredTasks[focusedIndex]) {
      e.preventDefault();
      onSelectTask(filteredTasks[focusedIndex]);
      onClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleTaskTap = (task: Task) => {
    onSelectTask(task);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-0" onKeyDown={handleKeyDown}>
        {/* Search Input */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              ref={inputRef}
              placeholder="Search tasks... (↑↓ to navigate, Enter to select, ESC to close)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Results */}
        <div 
          ref={resultsRef}
          className="max-h-96 overflow-y-auto p-2"
        >
          {filteredTasks.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              {query ? 'No tasks found' : 'Start typing to search...'}
            </div>
          ) : (
            filteredTasks.map((task, index) => (
              <div
                key={task.id}
                onClick={() => handleTaskTap(task)}
                onMouseEnter={() => !isMobile && setFocusedIndex(index)}
                className={`p-3 rounded-lg cursor-pointer transition-all active:scale-98 ${
                  index === focusedIndex
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 dark:border-blue-400'
                    : 'border border-transparent hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-blue-50 dark:active:bg-blue-900/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {task.activity}
                    </div>
                    {task.notes && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1 mt-1">
                        {task.notes}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {task.date}
                      </Badge>
                      <ClassificationBadge classification={task.classification} />
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <PriorityBadge priority={task.priority} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 border-t px-4 py-2 flex items-center justify-between text-xs text-gray-500">
          <span>{filteredTasks.length} results</span>
          {!isMobile && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <ArrowUp className="h-3 w-3" />
                <ArrowDown className="h-3 w-3" />
                Navigate
              </span>
              <span>Enter to select</span>
              <span>ESC to close</span>
            </div>
          )}
          {isMobile && (
            <span>Tap to select</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
