let meta = #{
    name: "focus-group",
    description: "Panel de personas UX/édition pour trancher une question de design UI",
    when_to_use: "Décision d’interface (placement, densité, accessibilité) avec votes multi-personas",
    phases: [
        #{ title: "Panel", detail: "5 personas votent en parallèle" },
        #{ title: "Synthèse", detail: "Consensus actionnable" },
    ],
};

// args.question (string, requis) — la question de design
// args.context (string, optionnel) — contexte produit / captures / contraintes
// args.options (string, optionnel) — options nommées à comparer
// args.surface (string, optionnel) — ex. « page /sports/ LE-RADAR »

let question = if args == () { () } else { args.question };
if question == () {
    pause("verification", "Passe args.question — la question de design à trancher.");
}

let context = if args == () || args.context == () { "" } else { args.context };
let options = if args == () || args.options == () { "" } else { args.options };
let surface = if args == () || args.surface == () { "interface web" } else { args.surface };

let vote_schema = #{
    "type": "object",
    "required": ["persona", "pick", "rationale", "risks", "confidence"],
    "properties": #{
        "persona": #{ "type": "string" },
        "pick": #{ "type": "string", "description": "Option retenue ou description courte du layout" },
        "rationale": #{ "type": "string" },
        "risks": #{ "type": "string" },
        "confidence": #{ "type": "number", "minimum": 0, "maximum": 1 },
    },
};

let consensus_schema = #{
    "type": "object",
    "required": ["winner", "summary", "css_guidance", "dissent"],
    "properties": #{
        "winner": #{ "type": "string" },
        "summary": #{ "type": "string" },
        "css_guidance": #{ "type": "string", "description": "Règles CSS/HTML concrètes à appliquer" },
        "dissent": #{ "type": "string" },
        "followups": #{ "type": "array", "items": #{ "type": "string" } },
    },
};

// Personas calibrés après 1ʳᵉ passe /sports/ (chevron) : presse web + a11y + dev.
// Contraintes dures à rappeler dans les prompts pour éviter le chrome SaaS.
let personas = [
    #{ id: "reader", label: "Lecteur campus (scan rapide)", angle: "Tu lis vite sur mobile et desktop. Tu veux repérer le sport, replier le bruit, sans chercher un contrôle perdu à droite. Préfère les clusters compacts collés au texte." },
    #{ id: "editor", label: "Rédac chef de pupitre sport", angle: "Tu gères un tableau de scores dense. Hiérarchie claire type journal, pas de chrome tableau de bord SaaS (pas de contrôles collés au bord droit)." },
    #{ id: "a11y", label: "Spécialiste accessibilité", angle: "Tu juges cible de clic (≥44px), details/summary, contraste, focus-visible sur tout le summary, sens du chevron ouvert/fermé, prefers-reduced-motion." },
    #{ id: "designer", label: "Designer presse numérique", angle: "Journalisme numérique (grilles, filets, typo). Unité typographique compacte ; chevrons au bord droit = anti-pattern admin." },
    #{ id: "dev", label: "Dev front pragmatique", angle: "CSS simple, subgrid-friendly, pas de margin-inline-start:auto pour coller un affordance au bord. Patterns natifs details/summary." },
];

phase("Panel");
let jobs = [];
let i = 0;
while i < personas.len() {
    let p = personas[i];
    let prompt = "";
    prompt += "Tu es le persona « " + p.label + " » dans un focus group UX.\n";
    prompt += "Angle: " + p.angle + "\n\n";
    prompt += "Surface: " + surface + "\n";
    prompt += "Question: " + question + "\n";
    if context != "" {
        prompt += "Contexte:\n" + context + "\n";
    }
    if options != "" {
        prompt += "Options à comparer:\n" + options + "\n";
    }
    prompt += "\nRéponds UNIQUEMENT via le schéma: persona (ton id « " + p.id + " »), pick (lettre d’option si fournie, sinon layout court), rationale (2-4 phrases), risks (1-2 phrases), confidence (0-1).\n";
    prompt += "Ne lis pas le dépôt. Raisonne depuis le contexte fourni. Sois concret (placement en rem/px, mobile, focus).\n";
    prompt += "Rappels: (1) un summary full-width peut rester cliquable même si le chevron est dans un cluster à gauche ; (2) margin-inline-start:auto pour un chevron = pattern SaaS, à justifier fortement ; (3) ne pas faire tourner une icône métier (emoji sport) pour indiquer l’état.";
    jobs.push(#{
        prompt: prompt,
        label: "persona:" + p.id,
        capability_mode: "read-only",
        output_schema: vote_schema,
    });
    i += 1;
}
let votes = parallel(jobs);

let vote_lines = "";
let ok_count = 0;
for r in votes {
    if r != () && r.success && r.output != () {
        ok_count += 1;
        vote_lines += "- [" + r.output.persona + "] pick=" + r.output.pick
            + " conf=" + r.output.confidence.to_string()
            + " | " + r.output.rationale
            + " | risks: " + r.output.risks + "\n";
    }
}
if ok_count == 0 {
    complete(#{ summary: "Aucun vote utilisable.", winner: "", votes: [] });
}
log(ok_count.to_string() + " votes reçus");

phase("Synthèse");
let synth_prompt = "";
synth_prompt += "Tu es le facilitateur d’un focus group UX pour " + surface + ".\n";
synth_prompt += "Question: " + question + "\n";
if options != "" { synth_prompt += "Options:\n" + options + "\n"; }
synth_prompt += "Votes du panel:\n" + vote_lines + "\n";
synth_prompt += "Produis un consensus actionnable: winner (option claire), summary (ce qu’on change), css_guidance (règles CSS/HTML précises, classes .sports-sport-block*), dissent (minorité), followups (optionnel).\n";
synth_prompt += "Privilégie les patterns presse web et l’accessibilité details/summary. Évite margin-left:auto pour coller un chevron au bord droit d’un titre de section.";

let synth = agent(synth_prompt, #{
    label: "facilitator",
    capability_mode: "read-only",
    output_schema: consensus_schema,
});

if synth == () || !synth.success || synth.output == () {
    complete(#{
        summary: "Votes reçus mais synthèse échouée — voir vote_lines.",
        winner: "",
        vote_lines: vote_lines,
    });
}

let out = synth.output;
let report = "";
report += "# Focus group — " + surface + "\n\n";
report += "## Question\n" + question + "\n\n";
report += "## Consensus\n**" + out.winner + "**\n\n" + out.summary + "\n\n";
report += "## CSS / HTML\n" + out.css_guidance + "\n\n";
report += "## Dissidence\n" + out.dissent + "\n\n";
report += "## Votes\n" + vote_lines + "\n";
let path = write_scratch_file("focus-group-report.md", report);

complete(#{
    path: path,
    winner: out.winner,
    summary: out.summary,
    css_guidance: out.css_guidance,
    dissent: out.dissent,
    report: report,
});
