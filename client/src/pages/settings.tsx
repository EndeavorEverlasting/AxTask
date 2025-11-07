
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { locationService } from "@/lib/location-notifications";

export default function Settings() {
  const { toast } = useToast();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);

  useEffect(() => {
    const enabled = localStorage.getItem('locationNotificationsEnabled') === 'true';
    setNotificationsEnabled(enabled);
    setLocationEnabled(enabled);
  }, []);

  const handleRequestPermissions = async () => {
    const granted = await locationService.requestPermissions();
    setPermissionsGranted(granted);
    
    if (granted) {
      toast({
        title: "Permissions granted",
        description: "Location-based notifications are now enabled.",
      });
    } else {
      toast({
        title: "Permissions denied",
        description: "Please enable location and notification permissions in your browser settings.",
        variant: "destructive",
      });
    }
  };

  const handleToggleNotifications = (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    localStorage.setItem('locationNotificationsEnabled', enabled.toString());
    
    if (enabled && !permissionsGranted) {
      handleRequestPermissions();
    }

    toast({
      title: enabled ? "Notifications enabled" : "Notifications disabled",
      description: enabled 
        ? "You'll receive reminders when near task locations."
        : "Location-based notifications turned off.",
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h2>
        <p className="text-gray-600 dark:text-gray-400">Manage your preferences and notifications</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Location-Based Notifications</CardTitle>
          <CardDescription>
            Get reminded about tasks when you're near their locations. Perfect for staying productive and on-track.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="notifications">Enable Notifications</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Receive task reminders based on your location
              </p>
            </div>
            <Switch
              id="notifications"
              checked={notificationsEnabled}
              onCheckedChange={handleToggleNotifications}
            />
          </div>

          {!permissionsGranted && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                Location and notification permissions are required for this feature to work.
              </p>
              <Button onClick={handleRequestPermissions} variant="outline" size="sm">
                Grant Permissions
              </Button>
            </div>
          )}

          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p><strong>How it works:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Add locations to your tasks (e.g., "Office", "Gym", "Store")</li>
              <li>When you're nearby, you'll get a notification</li>
              <li>Stay focused on your goals, even when distractions arise</li>
              <li>Notifications respect a 30-minute cooldown per task</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voice Input</CardTitle>
          <CardDescription>
            Speak your tasks instead of typing them
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p>Voice input is available on the task creation form:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Click the microphone icon next to Activity or Notes</li>
              <li>Speak clearly when prompted</li>
              <li>Your speech will be converted to text automatically</li>
              <li>Works best in Chrome and Edge browsers</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
