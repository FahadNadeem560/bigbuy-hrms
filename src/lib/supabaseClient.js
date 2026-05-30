import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://rtazykuylyccptnayxgf.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_Zm7dA_mLxb8ci8r5loLryQ_NBx9WSoF";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
