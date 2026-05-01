import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createLocationEventSchema } from "@shared/schema";
import { listUserLocationPlaces, upsertUserLocationPlace } from "../storage/locations";
import { createUserLocationEventAndScheduleOffsetTriggers } from "../storage/reminders";

const locationPlaceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  lat: z.number().finite().optional().nullable(),
  lng: z.number().finite().optional().nullable(),
  radiusMeters: z.number().int().min(50).max(5000).optional(),
});

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

export function registerLocationRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.get("/api/location-places", requireAuth, async (req, res) => {
    try {
      const rows = await listUserLocationPlaces(req.user!.id);
      res.json({ places: rows });
    } catch (error) {
      res.status(500).json({ message: "Failed to list places" });
    }
  });

  app.post("/api/location-places", requireAuth, async (req, res) => {
    try {
      const body = locationPlaceSchema.parse(req.body || {});
      const row = await upsertUserLocationPlace(req.user!.id, body);
      if (!row) return res.status(404).json({ message: "Place not found" });
      res.status(201).json(row);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to save place" });
    }
  });

  app.post("/api/location-events", requireAuth, async (req, res) => {
    try {
      const body = createLocationEventSchema.parse(req.body || {});
      const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
      const result = await createUserLocationEventAndScheduleOffsetTriggers({
        userId: req.user!.id,
        placeId: body.placeId,
        eventType: body.eventType,
        source: body.source,
        confidence: body.confidence,
        metadataJson: body.metadataJson ?? {},
        occurredAt,
      });
      if (!result) return res.status(500).json({ message: "Failed to persist location event" });
      const { event, scheduling } = result;
      res.status(201).json({ event, scheduling });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to process location event" });
    }
  });
}
