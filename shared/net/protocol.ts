import { GameObjectDefs, MapObjectDefs } from "../defs/register.ts";
import { GameConfig } from "../gameConfig.ts";

/**
 * The wire id of a game object is its index in the def registry, so adding or
 * removing a def silently renumbers every def after it: an old server and a new
 * client would agree on the protocol version and still disagree about what every
 * item id means. Folding a hash of the registered types into the version makes
 * that mismatch fail the find_game / join check instead, so the player gets the
 * "refresh the page" message rather than a frozen green screen.
 */
function hashTypes(types: string[]): number {
    // FNV-1a, 32 bit
    let hash = 0x811c9dc5;
    for (const type of types) {
        for (let i = 0; i < type.length; i++) {
            hash ^= type.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        hash ^= 0x2f; // "/", so ["ab","c"] and ["a","bc"] differ
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/** hash of every registered type, in the order that assigns their wire ids */
export const defsHash = hashTypes([
    ...GameObjectDefs.getAllTypes(),
    ...MapObjectDefs.getAllTypes(),
]);

/**
 * What the client and server actually compare: the hand-bumped
 * `GameConfig.protocolVersion` mixed with {@link defsHash}. Sent as a uint32 in
 * the join message, so it stays within the existing wire format.
 */
export const protocolVersion = (Math.imul(GameConfig.protocolVersion, 0x01000193) ^ defsHash)
    >>> 0;
