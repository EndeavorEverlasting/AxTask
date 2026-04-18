import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

type Place = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radiusMeters: number;
};

export function LocationPlacesSettingsCard() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const { data } = useQuery({
    queryKey: ["/api/location-places"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/location-places");
      return r.json() as Promise<{ places: Place[] }>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        radiusMeters: 200,
      };
      const la = parseFloat(lat);
      const ln = parseFloat(lng);
      if (Number.isFinite(la) && Number.isFinite(ln)) {
        payload.lat = la;
        payload.lng = ln;
      }
      const r = await apiRequest("POST", "/api/location-places", payload);
      return r.json();
    },
    onSuccess: () => {
      setName("");
      setLat("");
      setLng("");
      qc.invalidateQueries({ queryKey: ["/api/location-places"] });
    },
  });

  const places = data?.places ?? [];

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Location reminders (saved places)
        </CardTitle>
        <CardDescription>
          Store named places for future reminder hooks. Coordinates are optional; radius defaults to 200m.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Label (e.g. Office)" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} />
          <Input placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} />
        </div>
        <Button
          type="button"
          disabled={name.trim().length === 0 || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          Save place
        </Button>
        {places.length > 0 && (
          <ul className="text-sm space-y-1 text-muted-foreground">
            {places.map((p) => (
              <li key={p.id}>
                <span className="font-medium text-foreground">{p.name}</span>
                {p.lat != null && p.lng != null ? ` · ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : " · no coordinates"}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
