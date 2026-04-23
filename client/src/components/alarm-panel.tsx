import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { Task } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { applyAlarmPayloadWithFallback } from "@/lib/alarm-apply";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ClockTimePicker } from "@/components/ui/clock-time-picker";
import { cn } from "@/lib/utils";

interface AlarmPanelPrefill {
  taskId?: string;
  taskActivity?: string;
  alarmDate?: string;
  alarmTime?: string;
}

function parsePrefillEvent(event: Event): AlarmPanelPrefill {
  if (!(event instanceof CustomEvent)) return {};
  const detail = event.detail as Record<string, unknown> | undefined;
  if (!detail || typeof detail !== "object") return {};
  return {
    taskId: typeof detail.taskId === "string" ? detail.taskId : undefined,
    taskActivity: typeof detail.taskActivity === "string" ? detail.taskActivity : undefined,
    alarmDate: typeof detail.alarmDate === "string" ? detail.alarmDate : undefined,
    alarmTime: typeof detail.alarmTime === "string" ? detail.alarmTime : undefined,
  };
}

export function AlarmPanel() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("09:00");

  const tasksQuery = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const tasks = tasksQuery.data ?? [];
  const taskOptions = useMemo(
    () => tasks.filter((t) => t.status !== "completed").map((t) => ({ id: t.id, activity: t.activity })),
    [tasks],
  );

  useEffect(() => {
    const onOpen = (event: Event) => {
      const prefill = parsePrefillEvent(event);
      if (prefill.taskId) setTaskId(prefill.taskId);
      if (prefill.alarmDate) setDate(prefill.alarmDate);
      if (prefill.alarmTime) setTime(prefill.alarmTime);
      if (!prefill.taskId && prefill.taskActivity) {
        const match = taskOptions.find((t) => t.activity.toLowerCase().includes(prefill.taskActivity!.toLowerCase()));
        if (match) setTaskId(match.id);
      }
      setOpen(true);
    };
    window.addEventListener("axtask-open-alarm-panel", onOpen);
    return () => window.removeEventListener("axtask-open-alarm-panel", onOpen);
  }, [taskOptions]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const task = taskOptions.find((t) => t.id === taskId);
      if (!task) throw new Error("Select a task first.");
      const alarmAtIso = new Date(`${date}T${time}:00`).toISOString();
      const payload = {
        version: 1,
        taskId: task.id,
        taskActivity: task.activity,
        alarmDate: date,
        alarmTime: time,
        alarmAtIso,
      };
      const saveRes = await apiRequest("POST", "/api/alarm-snapshots", {
        deviceKey: "docker-hybrid",
        label: `${task.activity} @ ${date} ${time}`,
        payloadJson: JSON.stringify(payload),
      });
      const saved = await saveRes.json() as { id: string };
      const applyOutcome = await applyAlarmPayloadWithFallback(JSON.stringify(payload));
      return { saved, applyOutcome };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/alarm-snapshots"] });
      toast({
        title: "Alarm saved",
        description: "Alarm snapshot saved and routed to the best available apply channel.",
      });
      setOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Alarm save failed",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  const parsedDate = date ? parse(date, "yyyy-MM-dd", new Date()) : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set Task Alarm</DialogTitle>
          <DialogDescription>
            Reuses the task clock/date module so alarms match your normal scheduling flow.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Task</p>
            <Select value={taskId} onValueChange={setTaskId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a task" />
              </SelectTrigger>
              <SelectContent>
                {taskOptions.map((task) => (
                  <SelectItem key={task.id} value={task.id}>{task.activity}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Date</p>
              {isMobile ? (
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              ) : (
                <Popover modal={true}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                      {date ? format(parsedDate!, "PPP") : "Pick a date"}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={parsedDate}
                      onSelect={(day) => {
                        if (day) setDate(format(day, "yyyy-MM-dd"));
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Time</p>
              {isMobile ? (
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              ) : (
                <ClockTimePicker value={time} onChange={setTime} />
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !taskId}>
              {saveMutation.isPending ? "Saving..." : "Save Alarm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
