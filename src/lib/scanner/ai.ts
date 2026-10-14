import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AiAssessment, PageData } from "../dbim/types";
import { ORG_TYPES, type OrgType } from "../dbim/spec";

export const AI_MODEL = process.env.DBIM_AI_MODEL || "claude-opus-5-5";

/** Each key maps to an AI-assessed rule in rules/ai.ts. */
export const AI_CHECKS = {
  logo_lockup: "§5.2/§5.3 — The header uses the logo lockup required for this organization type, and the State Emblem (if used) is black on a light background or white on a dark one.",
  emblem_integrity: "§5.1/§5.5 — The State Emblem / logos are not stretched, cropped, recoloured, separated from 'Satyameva Jayate', or otherwise manipulated.",
  header_layout: "§5.4 — The header follows the DBIM generic header: logo lockup on the left, a prominent search bar, user controls (skip to main content, language selection, accessibility controls), global navigation menu, at most 2 co-branding logos.",
  icon_style: "§3.3 — Icons use ONE consistent style across the page (either all line/outline icons or all filled icons), with correct proportions.",
  icon_labels: "§3.8 — Icons for significant actions have a visible text label; icons are used sparingly and are recognizable.",
  banner_text: "§8.1 — Banner/carousel text is real HTML text overlaid on the image, not baked into the image (judge from the screenshot plus whether the banner's words appear in the page text).",
  imagery: "§6.1.3/§6.2 — Images carry no third-party ownership watermarks (stock-photo marks), and are of good quality (in focus, not stretched or pixelated).",
  headshots: "§6.1.4 — Headshots of people (e.g. Ministers) are on a white background, square (1:1), with the face filling about half the frame. Use 'unclear' if no headshots are visible.",
  plain_language: "§7.1.3 — Writing is concise, impartial (no promotional 'we are excited' tone), uses simple words and short sentences, and avoids unexplained jargon.",
  language_quality: "§7.1.3.3 — English text is free of obvious spelling/grammar errors, contains no Hinglish, and uses British English spelling consistently.",
  pm_quote: "§A.4.1.2 iv — (Ministry websites) The homepage has a PM Quote section: PM image with transparent background, a sector-relevant quote, the event and date, in the darkest shade of the colour group, with a hyperlink to the source.",
  persona_section: "§A.2/§A.4.1.2 ix — (Ministry websites) The homepage has a User Persona section letting visitors choose a persona (e.g. Student, Business Owner) to see tailored content.",
  homepage_sections: "§A.4.1.2 — (Ministry websites) The homepage contains the DBIM sections: top banner carousel, announcements ticker, PM quote, Ministry section with Minister/MoS headshots, key offerings, what's new, recent documents, personas, important links, citizen engagement/social feeds, central (CCPS) posts, infographics, footer logo carousel.",
} as const;
export type AiCheckKey = keyof typeof AI_CHECKS;

const AssessmentSchema = z.object({
  assessments: z.array(
    z.object({
      key: z.enum(Object.keys(AI_CHECKS) as [AiCheckKey, ...AiCheckKey[]]),
      status: z.enum(["pass", "fail", "warn", "unclear"]),
      confidence: z.number().describe("0 to 1"),
      explanation: z.string().describe("One or two sentences citing what is visible in the screenshots or text."),
    }),
  ),
});

function imageBlock(file: string | undefined, label: string): Anthropic.Beta.BetaContentBlockParam[] {
  if (!file || !fs.existsSync(file)) return [];
  const data = fs.readFileSync(file).toString("base64");
  return [
    { type: "text", text: label },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
  ];
}

const SYSTEM = `You audit Government of India websites against the Digital Brand Identity Manual (DBIM) v3.0 published by MeitY/NIC.
You receive screenshots and extracted text from one website and assess specific checklist items.
Judge only what the evidence shows. Use "unclear" when the screenshots do not show enough to decide, and "warn" for partial compliance.
Keep explanations factual and specific (name the element you are looking at).`;

export async function runAiChecks(home: PageData, orgType: OrgType): Promise<AiAssessment[]> {
  const client = new Anthropic();
  const org = ORG_TYPES[orgType];
  const keys = (Object.keys(AI_CHECKS) as AiCheckKey[]).filter(
    (k) => orgType === "ministry" || !["pm_quote", "persona_section", "homepage_sections"].includes(k),
  );
  const checklist = keys.map((k) => `- ${k}: ${AI_CHECKS[k]}`).join("\n");
  const text = home.bodyText.replace(/\n{3,}/g, "\n\n").slice(0, 12_000);

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...imageBlock(home.screenshotHeader, "Screenshot: website header (desktop, 1440px wide)"),
    ...imageBlock(home.screenshotFold, "Screenshot: homepage above the fold (desktop)"),
    ...imageBlock(home.screenshotFooter, "Screenshot: website footer"),
    {
      type: "text",
      text: `Website: ${home.finalUrl}
Organization type declared by the user: ${org.label} — DBIM requires ${org.lockup} and ${org.header}.
Lockup 2 = State Emblem + "Government of India" + Ministry/Department name. Lockup 3A = State Emblem + organization logo and name. Lockup 3B = organization logo and name, no emblem.

Homepage text (truncated):
"""
${text}
"""

Assess each of these checklist items and return one assessment per key:
${checklist}`,
    },
  ];

  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(AssessmentSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined to assess this page");
  if (!response.parsed_output) throw new Error(`Could not parse AI output (stop_reason: ${response.stop_reason})`);
  return response.parsed_output.assessments
    .filter((a) => keys.includes(a.key))
    .map((a) => ({ ...a, confidence: Math.max(0, Math.min(1, a.confidence)) }));
}
