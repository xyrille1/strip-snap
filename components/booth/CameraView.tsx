"use client";

export interface CameraViewProps {
  active: boolean;
}

// Real getUserMedia stream + video element wiring lands in Step 4 Item 5.
export default function CameraView({ active }: CameraViewProps) {
  return <div>{active ? "Camera preview placeholder" : "Camera inactive"}</div>;
}
