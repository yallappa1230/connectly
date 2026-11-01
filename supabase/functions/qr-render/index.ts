import QRCode from "npm:qrcode@1.5.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const value = typeof body?.value === "string" ? body.value : "";
    if (!value || value.length > 256 || !/^[a-f0-9]{64}$/.test(value)) {
      return new Response(JSON.stringify({ error: "Invalid friend QR token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svg = await QRCode.toString(value, {
      type: "svg",
      errorCorrectionLevel: "Q",
      margin: 2,
      scale: 7,
      color: { dark: "#0b141a", light: "#ffffff" },
    });

    return new Response(JSON.stringify({ svg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Could not generate QR code" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
