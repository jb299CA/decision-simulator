/** Treat a wide, short phone as a phone after rotation as well. */
export function isPhoneDrivingViewport(width: number, height: number): boolean {
  return width < 760 || (Math.min(width,height) < 540 && Math.max(width,height) < 1100);
}

/** Observer framing only: weapon position, aim and the separate seated optic stay unchanged. */
export function hatchCameraFrame(width: number, height: number) {
  const aspect = Math.max(.1,width / Math.max(1,height));
  const phone = isPhoneDrivingViewport(width,height), portrait = phone && aspect < 1;
  // Preserve a useful side-to-side view on a tall screen instead of cropping the
  // same narrow vertical lens down to a close-up of the receiver.
  const fov = portrait ? Math.min(106,2 * Math.atan(Math.tan(Math.PI / 6) / aspect) * 180 / Math.PI) : phone ? 60 : 52;
  return {
    fov,
    eye: portrait ? [.13,3.96,3.8] as const : phone ? [.13,3.82,3.6] as const : [.13,3.5,2.9] as const,
    lookAt: portrait ? [.48,3.96,-32] as const : phone ? [.48,3.7,-36] as const : [.48,3.4,-32] as const,
  };
}
