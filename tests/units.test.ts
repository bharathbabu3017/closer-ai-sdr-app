import { describe, expect, it } from "vitest";
import { IntakeError, normalizeFlatPayload } from "@/src/leads/intake";
import { textToEmailHtml } from "@/src/lib/emailHtml";
import { canTransition, effectiveTier, routeForQualification } from "@/src/pipeline/stateMachine";
import { testConfig } from "./helpers";

describe("routing", () => {
  it("uses config thresholds over Claude's own tier label", () => {
    expect(routeForQualification({ score: 72, tier: "warm" }, testConfig)).toBe("invite");
    expect(routeForQualification({ score: 69, tier: "hot" }, testConfig)).toBe("nurture");
    expect(routeForQualification({ score: 95, tier: "spam" }, testConfig)).toBe("disqualify");
    expect(effectiveTier({ score: 20, tier: "warm" }, testConfig)).toBe("cold");
  });

  it("only disqualifies cold leads when configured to", () => {
    const strict = { ...testConfig, qualification: { ...testConfig.qualification, disqualify_cold: true } };
    expect(routeForQualification({ score: 10, tier: "cold" }, testConfig)).toBe("nurture");
    expect(routeForQualification({ score: 10, tier: "cold" }, strict)).toBe("disqualify");
  });

  it("guards stage transitions", () => {
    expect(canTransition("NEW", "QUALIFYING")).toBe(true);
    expect(canTransition("NEW", "MEETING_BOOKED")).toBe(false);
    expect(canTransition("DISQUALIFIED", "ERROR")).toBe(false);
    expect(canTransition("ERROR", "QUALIFYING")).toBe(true);
  });
});

describe("normalizeFlatPayload", () => {
  it("maps common aliases and keeps every answer", () => {
    const lead = normalizeFlatPayload({
      first_name: "Sam",
      "Last Name": "Ortiz",
      "Work Email": " Sam@Example.com ",
      Organization: "Ortiz Labs",
      "Team size": 12,
      tools: ["Snowflake", "dbt"],
    });
    expect(lead).toMatchObject({ email: "sam@example.com", name: "Sam Ortiz", company: "Ortiz Labs" });
    expect(lead.answers).toContainEqual({ label: "tools", value: "Snowflake, dbt" });
  });

  it("finds an email in an unrecognized field, and rejects submissions without one", () => {
    expect(normalizeFlatPayload({ contact: "a@b.co" }).email).toBe("a@b.co");
    expect(() => normalizeFlatPayload({ name: "No email" })).toThrow(IntakeError);
  });
});

describe("textToEmailHtml", () => {
  it("escapes HTML and links URLs without swallowing trailing punctuation", () => {
    const html = textToEmailHtml("Hi <b>there</b>\n\nBook: https://cal.com/acme/intro.");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain('<a href="https://cal.com/acme/intro">https://cal.com/acme/intro</a>.');
  });
});
