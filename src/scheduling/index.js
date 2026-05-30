"use strict";
/**
 * Scheduling Module
 *
 * This module provides scheduling utilities that are safe to use in Temporal workflows.
 * It intentionally avoids importing zod to prevent bundler issues.
 *
 * For zod schemas, import from './types' directly (not workflow-safe).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTimeInPolicy = exports.isTimeInWindowSlot = exports.calculateWaitTime = void 0;
// Calculate wait time (workflow-safe)
var calculateWaitTime_1 = require("./calculateWaitTime");
Object.defineProperty(exports, "calculateWaitTime", { enumerable: true, get: function () { return calculateWaitTime_1.calculateWaitTime; } });
// Time window detection (workflow-safe)
var isTimeInWindow_1 = require("./isTimeInWindow");
Object.defineProperty(exports, "isTimeInWindowSlot", { enumerable: true, get: function () { return isTimeInWindow_1.isTimeInWindowSlot; } });
Object.defineProperty(exports, "isTimeInPolicy", { enumerable: true, get: function () { return isTimeInWindow_1.isTimeInPolicy; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7R0FPRzs7O0FBZUgsc0NBQXNDO0FBQ3RDLHlEQUF1RDtBQUE5QyxzSEFBQSxpQkFBaUIsT0FBQTtBQUUxQix3Q0FBd0M7QUFDeEMsbURBQXFFO0FBQTVELG9IQUFBLGtCQUFrQixPQUFBO0FBQUUsZ0hBQUEsY0FBYyxPQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTY2hlZHVsaW5nIE1vZHVsZVxuICpcbiAqIFRoaXMgbW9kdWxlIHByb3ZpZGVzIHNjaGVkdWxpbmcgdXRpbGl0aWVzIHRoYXQgYXJlIHNhZmUgdG8gdXNlIGluIFRlbXBvcmFsIHdvcmtmbG93cy5cbiAqIEl0IGludGVudGlvbmFsbHkgYXZvaWRzIGltcG9ydGluZyB6b2QgdG8gcHJldmVudCBidW5kbGVyIGlzc3Vlcy5cbiAqXG4gKiBGb3Igem9kIHNjaGVtYXMsIGltcG9ydCBmcm9tICcuL3R5cGVzJyBkaXJlY3RseSAobm90IHdvcmtmbG93LXNhZmUpLlxuICovXG5cbi8vIFdvcmtmbG93LXNhZmUgdHlwZXMgKG5vIHpvZCBkZXBlbmRlbmN5KVxuZXhwb3J0IHR5cGUge1xuICBUaW1lU3RhbXAsXG4gIERheU9mV2VlayxcbiAgVGltZVdpbmRvd1Nsb3QsXG4gIFdhaXRVbml0LFxuICBXYWl0SW5wdXRSZWxhdGl2ZSxcbiAgV2FpdElucHV0QWJzb2x1dGUsXG4gIFdhaXRJbnB1dFR5cGUsXG4gIENhbGN1bGF0ZVdhaXRUaW1lUmVzdWx0LFxuICBUaW1lV2luZG93UG9saWN5LFxufSBmcm9tICcuL3R5cGVzLXdvcmtmbG93J1xuXG4vLyBDYWxjdWxhdGUgd2FpdCB0aW1lICh3b3JrZmxvdy1zYWZlKVxuZXhwb3J0IHsgY2FsY3VsYXRlV2FpdFRpbWUgfSBmcm9tICcuL2NhbGN1bGF0ZVdhaXRUaW1lJ1xuXG4vLyBUaW1lIHdpbmRvdyBkZXRlY3Rpb24gKHdvcmtmbG93LXNhZmUpXG5leHBvcnQgeyBpc1RpbWVJbldpbmRvd1Nsb3QsIGlzVGltZUluUG9saWN5IH0gZnJvbSAnLi9pc1RpbWVJbldpbmRvdydcbiJdfQ==