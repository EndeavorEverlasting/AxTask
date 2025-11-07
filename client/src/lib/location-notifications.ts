
import type { Task } from "@shared/schema";

export interface LocationData {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export interface LocationNotificationConfig {
  enableNotifications: boolean;
  notificationRadius: number; // meters
  checkInterval: number; // milliseconds
}

export class LocationNotificationService {
  private watchId: number | null = null;
  private config: LocationNotificationConfig;
  private knownLocations: Map<string, { lat: number; lng: number }> = new Map();
  private lastNotificationTime: Map<string, number> = new Map();
  private notificationCooldown = 30 * 60 * 1000; // 30 minutes

  constructor(config?: Partial<LocationNotificationConfig>) {
    this.config = {
      enableNotifications: config?.enableNotifications ?? true,
      notificationRadius: config?.notificationRadius ?? 100, // 100 meters
      checkInterval: config?.checkInterval ?? 60000, // 1 minute
    };
  }

  async requestPermissions(): Promise<boolean> {
    if (!('geolocation' in navigator)) {
      console.warn('Geolocation not supported');
      return false;
    }

    if (!('Notification' in window)) {
      console.warn('Notifications not supported');
      return false;
    }

    const notificationPermission = await Notification.requestPermission();
    if (notificationPermission !== 'granted') {
      return false;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false)
      );
    });
  }

  startTracking(tasks: Task[]) {
    if (!this.config.enableNotifications) return;

    // Build location database from tasks
    this.buildLocationDatabase(tasks);

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handleLocationUpdate(position, tasks),
      (error) => console.error('Location error:', error),
      {
        enableHighAccuracy: false,
        maximumAge: this.config.checkInterval,
        timeout: 10000,
      }
    );
  }

  stopTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private buildLocationDatabase(tasks: Task[]) {
    // In production, you'd geocode these locations
    // For now, we'll store them for manual geocoding or use a geocoding API
    const locationSet = new Set<string>();
    tasks.forEach(task => {
      if (task.location) {
        locationSet.add(task.location.toLowerCase());
      }
    });
  }

  private async handleLocationUpdate(position: GeolocationPosition, tasks: Task[]) {
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;

    // Check each pending task with a location
    for (const task of tasks) {
      if (
        task.status === 'pending' &&
        task.location &&
        task.priority !== 'Highest' &&
        task.priority !== 'High'
      ) {
        // In production, geocode task.location and check distance
        // For demo, we'll check if location name matches common patterns
        const shouldNotify = this.shouldNotifyForTask(task, userLat, userLng);
        
        if (shouldNotify) {
          this.sendNotification(task);
        }
      }
    }
  }

  private shouldNotifyForTask(task: Task, lat: number, lng: number): boolean {
    const taskId = task.id;
    const lastNotification = this.lastNotificationTime.get(taskId);
    
    if (lastNotification && Date.now() - lastNotification < this.notificationCooldown) {
      return false;
    }

    // Check if user is at a "distraction" location
    const distractionLocations = ['bar', 'club', 'dispensary', 'pub', 'casino', 'lounge'];
    const location = task.location?.toLowerCase() || '';
    
    // Simple heuristic: if the task is NOT at a distraction location but user might be
    const isDistractionTask = distractionLocations.some(d => location.includes(d));
    
    return !isDistractionTask; // Notify about productive tasks when potentially distracted
  }

  private sendNotification(task: Task) {
    if (Notification.permission !== 'granted') return;

    const notification = new Notification('Task Reminder', {
      body: `You have a pending task: ${task.activity}${task.location ? ` at ${task.location}` : ''}`,
      icon: '/favicon.ico',
      tag: task.id,
      requireInteraction: false,
      data: { taskId: task.id },
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    this.lastNotificationTime.set(task.id, Date.now());

    // Auto-close after 10 seconds
    setTimeout(() => notification.close(), 10000);
  }

  // Calculate distance between two coordinates (Haversine formula)
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

export const locationService = new LocationNotificationService();
