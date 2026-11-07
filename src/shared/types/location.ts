export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface SelectedPlace {
  id: string;
  name: string;
  address: string;
  coordinate: Coordinate;
  isSupportedRegion: boolean;
}
