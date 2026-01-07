import "dotenv/config";
import { supabase } from "../lib/supabaseClient.js";

const episodeId = process.argv[2] || "ea5aa404-13ee-f7ca-7a9a-c217d446dacd";
const segmentKey = process.argv[3] || "intro";

const { data, error } = await supabase
  .from("cloudia_segments")
  .select("*")
  .eq("episode_id", episodeId)
  .eq("segment_key", segmentKey)
  .single();

if (error) {
  console.error("Error:", error);
} else {
  console.log(JSON.stringify(data, null, 2));
}

