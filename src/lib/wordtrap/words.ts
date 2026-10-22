export interface WordCard {
  id: string;
  category: string;
  word: string;
  clues: readonly string[];
}

export const WORDS: readonly WordCard[] = [
  { id: "whisk", category: "Kitchen", word: "Whisk", clues: ["loops of wire", "beats egg whites", "makes peaks", "balloon of metal", "frosting tool"] },
  { id: "ladle", category: "Kitchen", word: "Ladle", clues: ["deep bowl on a handle", "serves soup", "scoops broth", "long dipper", "from the pot"] },
  { id: "colander", category: "Kitchen", word: "Colander", clues: ["holes all over", "drains pasta", "water falls through", "bowl full of dots", "rinses berries"] },
  { id: "tongs", category: "Kitchen", word: "Tongs", clues: ["pinches food", "two arms", "flips on a grill", "grabs without fingers", "salad server"] },
  { id: "anchor", category: "Ocean", word: "Anchor", clues: ["holds a ship", "heavy iron hook", "drops on a chain", "stops the drift", "bites the seabed"] },
  { id: "kelp", category: "Ocean", word: "Kelp", clues: ["underwater forest", "long brown ribbons", "sways in current", "seaweed towers", "otters wrap in it"] },
  { id: "buoy", category: "Ocean", word: "Buoy", clues: ["floats as a marker", "rings a bell", "painted channel", "bobs in the harbor", "warns the boats"] },
  { id: "tide", category: "Ocean", word: "Tide", clues: ["moon pulls it", "shoreline breathes", "high and low", "pools in the rocks", "comes in twice"] },
  { id: "hail", category: "Weather", word: "Hail", clues: ["ice from a storm", "pings on the roof", "summer stones", "dents the car", "falls hard"] },
  { id: "frost", category: "Weather", word: "Frost", clues: ["white on the grass", "morning crystals", "window feathers", "kills the blossoms", "cold lace"] },
  { id: "drizzle", category: "Weather", word: "Drizzle", clues: ["fine light rain", "barely wets you", "gray mist fall", "umbrella optional", "soft and endless"] },
  { id: "gust", category: "Weather", word: "Gust", clues: ["sudden burst of wind", "slams a door", "steals a hat", "one hard push", "then it is gone"] },
  { id: "metronome", category: "Music", word: "Metronome", clues: ["clicks the tempo", "keeps you honest", "pendulum tick", "practice companion", "steady pulse"] },
  { id: "mute", category: "Music", word: "Mute", clues: ["softens the brass", "plunger in the bell", "quiets a string", "changes the color", "less bite"] },
  { id: "bridge", category: "Music", word: "Bridge", clues: ["the contrasting section", "between choruses", "lifts the song", "a new chord path", "then the hook returns"] },
  { id: "reed", category: "Music", word: "Reed", clues: ["thin cane strip", "vibrates in the mouth", "clarinet voice", "soaks before playing", "double or single"] },
  { id: "alley", category: "City", word: "Alley", clues: ["narrow between buildings", "service doors", "shortcut at night", "dumpsters live here", "barely a street"] },
  { id: "turnstile", category: "City", word: "Turnstile", clues: ["rotates to let you pass", "one person at a time", "subway entrance", "clicks each entry", "arms like a wheel"] },
  { id: "scaffold", category: "City", word: "Scaffold", clues: ["temporary frame", "workers stand on it", "wraps a facade", "poles and planks", "construction skin"] },
  { id: "hydrant", category: "City", word: "Hydrant", clues: ["sidewalk water post", "fire crews open it", "dogs know it", "painted cap", "sudden fountain"] },
  { id: "trellis", category: "Garden", word: "Trellis", clues: ["lattice for vines", "roses climb it", "grid of wood", "holds the climbers", "garden wall"] },
  { id: "prune", category: "Garden", word: "Prune", clues: ["cut the dead wood", "shapes a shrub", "shears in hand", "winter haircut", "encourages growth"] },
  { id: "compost", category: "Garden", word: "Compost", clues: ["rotting scraps become soil", "warm pile", "peels and leaves", "dark and crumbly", "feeds the beds"] },
  { id: "bulb", category: "Garden", word: "Bulb", clues: ["planted in autumn", "sleeps underground", "tulips start here", "layered like an onion", "springs up later"] },
  { id: "orbit", category: "Space", word: "Orbit", clues: ["path around a body", "falling and missing", "satellites live here", "elliptical loop", "never quite lands"] },
  { id: "crater", category: "Space", word: "Crater", clues: ["impact scar", "bowl in the dust", "rim raised", "moon is covered", "a collision's footprint"] },
  { id: "nebula", category: "Space", word: "Nebula", clues: ["cloud of gas", "nursery of stars", "colored in photos", "dust and light", "between the suns"] },
  { id: "rover", category: "Space", word: "Rover", clues: ["wheels on another world", "sends pictures home", "slow and patient", "robot geologist", "red dust on it"] },
  { id: "serve", category: "Sport", word: "Serve", clues: ["starts the rally", "toss and strike", "over the net first", "ace if it lands", "the opening hit"] },
  { id: "cleat", category: "Sport", word: "Cleat", clues: ["studded shoe", "grips the turf", "mud in the studs", "locker room smell", "field footwear"] },
  { id: "relay", category: "Sport", word: "Relay", clues: ["baton passed", "four runners", "one team leg", "don't drop it", "sprint in pieces"] },
  { id: "foul", category: "Sport", word: "Foul", clues: ["against the rules", "whistle blows", "free shot after", "too much contact", "the ref's call"] },
];

export const CATEGORY_BLUFFS: Readonly<Record<string, readonly string[]>> = {
  Kitchen: ["somewhere near the stove", "you would miss it while cooking", "ordinary kitchen thing", "lives in a drawer", "used around food"],
  Ocean: ["you find it by the water", "has to do with the sea", "coastal, sort of", "boats would know it", "salt and weather"],
  Weather: ["comes from the sky", "you notice it outside", "a kind of conditions", "changes the day", "you dress for it"],
  Music: ["musicians deal with it", "part of playing", "in a rehearsal", "about sound", "on the stand or in the case"],
  City: ["urban, not nature", "you pass it walking", "part of a street", "built, not grown", "downtown object"],
  Garden: ["lives outdoors with plants", "a gardener would know", "soil and seasons", "in the yard", "green-thumb territory"],
  Space: ["beyond the atmosphere", "astronomers talk about it", "not on earth", "in the dark up there", "mission related"],
  Sport: ["on a field or court", "rules are involved", "during a match", "athletes know it", "part of the game"],
};

export function wordsInCategory(category: string): WordCard[] {
  return WORDS.filter((card) => card.category === category);
}

export function cardById(id: string): WordCard | undefined {
  return WORDS.find((card) => card.id === id);
}
