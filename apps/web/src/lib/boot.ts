// The app shell (UpcomingContext) asks for the same four endpoints on every route. Those
// requests could not start until React had mounted, which on a throttled phone is several
// hundred milliseconds after the entry chunk began executing — and on a scale-to-zero backend
// the FIRST of those requests is the one paying the database wake.
//
// Importing this module first in main.tsx puts them on the wire during module evaluation,
// before react-dom, the router, or any page module has been touched. UpcomingContext's effect
// then adopts the already-in-flight promises through requestCache's dedup, with no change to
// that file and no second request.
//
// ONE request: /board carries all four of the shell's reads, so this is one connection and one
// database wake rather than four. Nothing new is being asked of the database.
import { paths, prefetchPath } from "../api";

prefetchPath(paths.board());
