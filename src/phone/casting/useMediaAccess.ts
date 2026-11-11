import { useSyncExternalStore } from "react";
import {
  getMediaAccess,
  getServerMediaAccess,
  subscribeMediaAccess,
} from "./mediaAccess";

/** The phone's motion and microphone access, kept in sync with the browser's permission state. */
export function useMediaAccess() {
  return useSyncExternalStore(
    subscribeMediaAccess,
    getMediaAccess,
    getServerMediaAccess,
  );
}
