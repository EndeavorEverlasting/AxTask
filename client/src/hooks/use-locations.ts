import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type LocationPlaceRow = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radiusMeters: number;
};

export function useLocationPlaces() {
  return useQuery({
    queryKey: ["/api/location-places"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/location-places");
      return r.json() as Promise<{ places: LocationPlaceRow[] }>;
    },
  });
}
