import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Permet a l'app de fonctionner (camera, coach vocal) meme sans Supabase
// configure, en degradant proprement le volet social plutot que de planter.
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes("xxxxxxxx"));

export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;
