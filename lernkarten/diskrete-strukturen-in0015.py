import sys  # Aufruf: python3 diskrete-strukturen-in0015.py diskrete-strukturen-in0015.csv

T1, T2, T3, T4, T5 = "1-logik-und-beweise", "2-mengenlehre", "3-folgen-tupel-wörter", "4-induktion-rekursion", "5-relationen"
FALLE = "prüfungsfalle"

cards = []
def add(tags, front, back):
    cards.append((front.strip(), back.strip(), ", ".join(tags)))

# ───────────────────────── 1 LOGIK UND BEWEISE ─────────────────────────
s = [T1, "1.1-aussagen-junktoren"]
add(s, "Was ist eine **Aussage** (im mathematischen Sinn)?",
    "Etwas, das **wahr oder falsch** sein kann.\n\n- »2 ist gerade« → Aussage\n- »Mach das Fenster auf« → keine Aussage")
add(s, "Was ist eine **Aussageform**? Wann wird sie zur Aussage?",
    "Ein Ausdruck mit Variable, z. B. »x ist gerade«. Erst wenn festgelegt ist, welchen Wert x hat bzw. welchen Bereich x durchläuft, ist er bewertbar.")
add(s, "Wann heißt eine Aussageform **erfüllbar**, wann **allgemeingültig**?",
    "- **erfüllbar**: in **mindestens einer** zulässigen Situation wahr\n- **allgemeingültig**: in **jeder** zulässigen Situation wahr\n\nBsp.: »x > 0« (x ∈ ℝ) ist erfüllbar, aber nicht allgemeingültig; »x > 0 ∨ ¬(x > 0)« ist allgemeingültig.")
add(s, "Wann ist **A ∧ B** wahr, wann **A ∨ B**?",
    "- A ∧ B: nur wenn **beide** wahr sind\n- A ∨ B: wenn **mindestens eine** wahr ist (einschließendes Oder – beide dürfen wahr sein)")
add(s + [FALLE], "Unterschied zwischen mathematischem **Oder (∨)** und **»entweder … oder« (XOR)**?",
    "- ∨ ist **einschließend**: wahr, wenn mindestens eine Aussage wahr ist (auch beide)\n- XOR: wahr, wenn **genau eine** Aussage wahr ist")
add(s, "Was bewirkt **¬A**?", "Die Negation kehrt den Wahrheitswert von A um.")
add(s, "Was stellen **Venn-Diagramme** in der Logik dar?",
    "Bereiche stehen für die Fälle, in denen eine Aussage wahr ist. Ein logischer Ausdruck beschreibt so, welche Situationen erlaubt oder ausgeschlossen sind.")

s = [T1, "1.2-implikation"]
add(s + [FALLE], "Wann ist die Implikation **A → B** falsch?",
    "**Nur** wenn A wahr und B falsch ist. In allen anderen Fällen ist sie wahr – insbesondere immer, wenn A falsch ist.")
add(s, "Wahrheitstabelle von **A → B**?",
    "- A w, B w → **w**\n- A w, B f → **f**\n- A f, B w → **w**\n- A f, B f → **w**")
add(s, "Warum ist »Wenn ich bestehe, gebe ich dir einen Kaffee aus« wahr, wenn ich **nicht** bestehe?",
    "Das Versprechen ist nur gebrochen, wenn ich bestehe **und** keinen Kaffee ausgebe. Bestehe ich nicht, wurde nichts verlangt → die Implikation ist wahr.")
add(s + [FALLE], "Darf man aus **A → B** auf **B → A** schließen?",
    "**Nein!** Bsp.: »x = 2 → x² = 4« gilt für alle reellen x, aber »x² = 4 → x = 2« nicht (Gegenbeispiel x = −2).")
add(s, "Was bedeutet **A ↔ B** und was musst du im Beweis zeigen?",
    "»A genau dann, wenn B«. Im Beweis zeigst du **beide Richtungen**: erst A → B, dann B → A.")
add(s + [FALLE], "Bei **A → B**: Was ist **hinreichend**, was **notwendig**?",
    "- **A ist hinreichend** für B (A reicht aus, um B sicherzustellen)\n- **B ist notwendig** für A (ohne B kann A nicht gelten)\n\nMerke: hinreichend = vorne am Pfeil, notwendig = was hinten zwingend erfüllt sein muss.")
add(s, "Ist »if A then B else C« dasselbe wie die Implikation A → B?",
    "Nein. if-then-else **wählt** je nach A einen von zwei Fällen aus; A → B ist eine einzelne Aussage mit Wahrheitswert.")

s = [T1, "1.3-quantoren"]
add(s, "Wie liest man **∀** und **∃**?",
    "- ∀: »für alle«\n- ∃: »es existiert (mindestens) ein«")
add(s, "Was braucht man, um eine **All-Aussage** zu beweisen bzw. zu widerlegen?",
    "- **Beweis**: Argument, das für **jedes** erlaubte Element funktioniert\n- **Widerlegung**: **ein** Gegenbeispiel reicht")
add(s, "Was braucht man, um eine **Existenz-Aussage** zu beweisen?",
    "Einen **konkreten Zeugen**. Bsp.: »∃ n ∈ ℕ: n² = 9« – belegt durch n = 3.")
add(s + [FALLE], "Formalisiere: »**Alle x, die R erfüllen, erfüllen auch P**«.",
    "**∀x: R(x) → P(x)**  (mit Pfeil!)")
add(s + [FALLE], "Formalisiere: »**Es gibt ein x, das R und P erfüllt**«.",
    "**∃x: R(x) ∧ P(x)**  (mit UND, nicht Pfeil – der Zeuge muss beide Eigenschaften wirklich haben)")
add(s, "Ist »Alle Einhörner in diesem Raum tragen eine Brille« wahr, wenn es keine Einhörner gibt? Und »Einige Einhörner tragen eine Brille«?",
    "- All-Aussage: **wahr** (es gibt kein Gegenbeispiel – »leer wahr«)\n- Existenz-Aussage: **falsch** (es gibt keinen Zeugen)")
add(s + [FALLE], "Ist die Reihenfolge von Quantoren wichtig? Beispiel?",
    "**Ja!**\n- »∀ Person ∃ Film, den sie mag« – jede Person kann einen anderen Film haben\n- »∃ Film ∀ Person mag ihn« – **ein und derselbe** Film für alle")

s = [T1, "1.4-verneinung"]
add(s, "Wie lautet **¬(∀x P(x))**?", "**∃x ¬P(x)** – »nicht für alle« = »es gibt mindestens einen Gegenfall«.")
add(s, "Wie lautet **¬(∃x P(x))**?", "**∀x ¬P(x)** – »es gibt keinen« = »für alle gilt nicht«.")
add(s + [FALLE], "Verneine korrekt: »Alle Studierenden mögen Mathematik«.",
    "»**Mindestens ein** Studierender mag Mathematik **nicht**.«\n\n**Nicht**: »Kein Studierender mag Mathematik« – das wäre viel stärker.")
add(s, "Verneine: »Alle Zahlen sind gerade«.", "»Es gibt (mindestens) eine Zahl, die nicht gerade ist.«")

s = [T1, "1.5-beweisstrategien"]
add(s, "Was ist ein **Beweis**?",
    "Eine Folge nachvollziehbarer Schlüsse von Definitionen, Annahmen und bekannten Tatsachen hin zur Behauptung.")
add(s, "Wie funktioniert ein **direkter Beweis** von A → B?", "Nimm A an und leite daraus B her.")
add(s, "Beweise direkt: Die Summe zweier gerader ganzer Zahlen ist gerade.",
    "Seien die Zahlen 2k und 2m mit k, m ∈ ℤ. Summe: 2k + 2m = **2(k + m)**, das Doppelte einer ganzen Zahl → gerade. ∎")
add(s, "Was ist die **Kontraposition** von A → B?",
    "**¬B → ¬A** – logisch gleichwertig zu A → B, darf also stattdessen bewiesen werden.")
add(s, "Zeige per Kontraposition: »Ist 3n + 2 ungerade, so ist n ungerade.«",
    "Zeige stattdessen: »Ist n gerade, so ist 3n + 2 gerade.«\nn = 2k ⇒ 3n + 2 = 6k + 2 = 2(3k + 1) → gerade. ∎")
add(s, "Wie läuft ein **Widerspruchsbeweis** ab?",
    "1. Nimm an, die Behauptung sei **falsch** (Negation annehmen)\n2. Leite etwas Unmögliches her\n3. ⇒ Die Behauptung muss wahr sein")
add(s, "Widerspruchsbeweis: Warum kommt bei 22 Tagen ein Wochentag mindestens viermal vor?",
    "Annahme: Jeder Wochentag höchstens dreimal ⇒ höchstens 7 · 3 = 21 Tage. Widerspruch zu 22 Tagen. ∎")
add(s, "Was bedeuten **Definition, Lemma, Satz/Theorem, Korollar**?",
    "- **Def.**: Festlegung eines Begriffs\n- **Lemma**: Hilfssatz\n- **Satz/Theorem**: relevante bewiesene Aussage\n- **Korollar**: eher direkte Folgerung aus einem Satz")
add(s, "Syllogismus: Alle P sind Q, alle Q sind R. Was folgt?",
    "Alle P sind R – rein logisch, ohne zu wissen, was P, Q, R konkret sind.")

s = [T1, "1.6-beweisfehler"]
add(s + [FALLE], "Fehler? »n > 0 ⇒ n² > 0, also auch n² > 0 ⇒ n > 0.«",
    "Pfeilrichtung unzulässig umgekehrt. Gegenbeispiel: n = −1 (n² = 1 > 0, aber n < 0).")
add(s + [FALLE], "Fehler? Zu zeigen »n² gerade ⇒ n gerade«, Beweis beginnt mit »Sei n = 2k …«.",
    "Das Ziel (n gerade) wird **vorausgesetzt** statt bewiesen – Zirkelschluss.")

# ───────────────────────── 2 MENGENLEHRE ─────────────────────────
s = [T2, "2.1-grundbegriffe"]
add(s, "Was ist eine **Menge**? Welche zwei Dinge sind bei Mengen egal?",
    "Eine Zusammenfassung klar unterscheidbarer Objekte. Egal sind **Reihenfolge** und **Wiederholungen**:\n{1, 2, 3} = {3, 1, 2, 1, 1}")
add(s, "Was bedeuten **∈**, **∉** und **∅**?",
    "- a ∈ A: a ist Element von A\n- a ∉ A: a ist kein Element von A\n- ∅: die leere Menge (keine Elemente)")
add(s + [FALLE], "Unterschied zwischen **∅** und **{∅}**?",
    "- ∅ enthält **nichts**: |∅| = 0\n- {∅} enthält **genau ein Element**, nämlich die leere Menge: |{∅}| = 1")
add(s, "Nenne die Zahlenmengen **ℕ, ℕ₀, ℤ, ℚ, ℝ**.",
    "- ℕ = {1, 2, 3, …}\n- ℕ₀ = ℕ ∪ {0}\n- ℤ: ganze Zahlen\n- ℚ: Brüche ganzer Zahlen mit Nenner ≠ 0\n- ℝ: reelle Zahlen\n\nTipp: In Aufgaben immer zuerst die Grundmenge prüfen!")

s = [T2, "2.2-mengendefinition"]
add(s, "Zwei Wege, eine Menge per Vorschrift zu definieren (Folienbegriffe)?",
    "- **Aussonderung/Auswahl**: {x ∈ ℕ | x gerade ∧ x < 8} = {2, 4, 6}\n- **Ersetzung**: {2x | x ∈ {1, 2, 3}} = {2, 4, 6}\n\nDer senkrechte Strich heißt »für die gilt«.")
add(s, "Was ist **Russells Antinomie** und welche Konsequenz zieht man?",
    "Die »Menge aller Mengen, die sich nicht selbst enthalten« führt zum Paradox: Enthält sie sich selbst? Ja ⇔ nein.\n\nKonsequenz: Mengen immer **aus einer bereits festgelegten Grundmenge** aussondern, nicht »alles, was …« sammeln.")

s = [T2, "2.3-element-teilmenge"]
add(s, "Was bedeutet **A ⊆ B**, was **A ⊊ B**?",
    "- A ⊆ B: **jedes** Element von A liegt auch in B\n- A ⊊ B: zusätzlich A ≠ B (echte Teilmenge)")
add(s + [FALLE], "B = {1, 2}. Wahr oder falsch: 1 ∈ B, {1} ⊆ B, {1} ∈ B?",
    "- 1 ∈ B: **wahr**\n- {1} ⊆ B: **wahr**\n- {1} ∈ B: **falsch** – die Elemente von B sind die Zahlen 1 und 2, nicht die Menge {1}")
add(s + [FALLE], "Ist ∅ Teilmenge jeder Menge? Ist ∅ Element jeder Menge?",
    "- ∅ ⊆ A gilt für **jede** Menge A\n- ∅ ∈ A gilt **nicht** allgemein (z. B. ∅ ∉ {1, 2})")

s = [T2, "2.4-mengenoperationen"]
add(s, "A = {1, 2, 3}, B = {3, 4}. Berechne A ∪ B, A ∩ B, A \\ B, B \\ A, A Δ B.",
    "- A ∪ B = {1, 2, 3, 4}\n- A ∩ B = {3}\n- A \\ B = {1, 2}\n- B \\ A = {4}\n- A Δ B = {1, 2, 4}")
add(s, "Was ist die **symmetrische Differenz** A Δ B?",
    "Alle Elemente, die in **genau einer** der beiden Mengen liegen:\nA Δ B = (A \\ B) ∪ (B \\ A)")
add(s, "Ist die Mengendifferenz kommutativ?", "Nein: A \\ B ≠ B \\ A im Allgemeinen (z. B. {1,2} vs. {4} oben).")
add(s, "Was ist das **Komplement** von A und was braucht man dafür?",
    "Alle Elemente des **Universums Ω**, die nicht in A liegen. Ohne festgelegtes Universum ist »außerhalb von A« nicht definiert.")
add(s, "Merkbrücke Mengen ↔ Logik: ∩, ∪, Komplement, \\ ?",
    "- ∩ ↔ UND\n- ∪ ↔ ODER\n- Komplement ↔ NICHT\n- A \\ B ↔ A UND NICHT B")

s = [T2, "2.5-potenzmenge-kardinalität"]
add(s, "Was ist die **Kardinalität** |A| einer endlichen Menge?",
    "Die Anzahl **verschiedener** Elemente. |{1, 2, 3}| = 3; Wiederholungen zählen nicht.")
add(s, "Was ist die **Potenzmenge** P(A)? Bestimme P({a, b}).",
    "Die Menge **aller Teilmengen** von A (auch 2^A geschrieben).\nP({a, b}) = {∅, {a}, {b}, {a, b}}")
add(s, "Wie viele Elemente hat P(A), wenn |A| = n? Warum?",
    "**2ⁿ**. Für jedes der n Elemente gibt es 2 Entscheidungen (drin/draußen) ⇒ 2 · 2 · … · 2 = 2ⁿ. ∅ und A selbst zählen mit.")
add(s, "Gib alle Teilmengen von {a, b, c} an.",
    "∅, {a}, {b}, {c}, {a, b}, {a, c}, {b, c}, {a, b, c} – also 2³ = 8 Stück.")
add(s + [FALLE], "Für A = {a, b}: a ∈ A – gilt auch a ∈ P(A)?",
    "Nein. P(A) enthält **Mengen** als Elemente: {a} ∈ P(A), aber a ∉ P(A). Verschiedene Ebenen!")

s = [T2, "2.6-familien-partitionen"]
add(s, "Was liefern **große Vereinigung ⋃** und **großer Schnitt ⋂** über eine Mengenfamilie?",
    "- ⋃: alle Elemente, die in **mindestens einer** Menge liegen\n- ⋂: alle Elemente, die in **jeder** Menge liegen\n\nBsp. {1,2}, {2,3}, {2,4}: ⋃ = {1,2,3,4}, ⋂ = {2}")
add(s, "Was gilt laut Vorlesung für ⋃ bzw. ⋂ über eine **leere** Mengenfamilie?",
    "- Vereinigung über leere Familie = **∅**\n- Schnitt über leere Familie ist **nicht definiert**")
add(s, "Was ist eine **Partition** einer Menge M? (3 Bedingungen)",
    "Eine Zerlegung von M in Blöcke, die\n1. **nicht leer** sind,\n2. **paarweise disjunkt** sind,\n3. zusammen **ganz M** ergeben.\n\nBsp.: {{1, 3}, {2, 4}} partitioniert {1, 2, 3, 4}.")
add(s, "Nenne eine Partition von ℤ.", "{gerade Zahlen, ungerade Zahlen}")

s = [T2, "2.7-mengengesetze"]
add(s, "Nenne Kommutativ- und Distributivgesetz für Mengen.",
    "- A ∪ B = B ∪ A, A ∩ B = B ∩ A\n- A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)")
add(s, "Wie lauten die **De-Morgan-Regeln** für Mengen?",
    "- Komplement(A ∩ B) = Komplement(A) ∪ Komplement(B)\n- Komplement(A ∪ B) = Komplement(A) ∩ Komplement(B)\n\nIn Worten: »nicht in beiden« = »nicht in A oder nicht in B«.")
add(s, "Vereinfache **A \\ (B ∪ C)**.",
    "= **(A \\ B) ∩ (A \\ C)**\nx liegt in A und weder in B noch in C.")
add(s, "Wie beweist du eine **Mengengleichheit** X = Y zuverlässig?",
    "Elementweise, beide Richtungen:\n1. Sei x ∈ X beliebig ⇒ zeige x ∈ Y (X ⊆ Y)\n2. Sei x ∈ Y beliebig ⇒ zeige x ∈ X (Y ⊆ X)\n\nFür eine **falsche** Gleichheit reicht ein konkretes Gegenbeispiel mit kleinen Mengen.")

s = [T2, "2.8-venn-kv-diagramme"]
add(s, "Wie viele Felder (Fälle) hat ein KV-Diagramm für n Mengen?",
    "**2ⁿ** – jede Ja/Nein-Kombination der Zugehörigkeit. 2 Mengen: 4, 3 Mengen: 8, 4 Mengen: 16.")
add(s, "Wofür nutzt die Vorlesung Venn- und KV-Diagramme?",
    "Um Mengenidentitäten **bildlich** zu prüfen (auch für 4 oder 5 Mengen), nicht nur algebraisch.")

# ───────────────────────── 3 FOLGEN, TUPEL, WÖRTER ─────────────────────────
s = [T3, "3.1-folgen-tupel"]
add(s + [FALLE], "Menge vs. Folge: Sind {a, b, a} und {b, a} gleich? Und (a, b, a) und (b, a)?",
    "- Mengen: **gleich** (Reihenfolge und Wiederholung egal)\n- Folgen: **verschieden** (Position und Wiederholung zählen; 3 vs. 2 Einträge)")
add(s, "Was ist ein **Tupel**, ein **Paar**?",
    "Ein Tupel ist eine **endliche Folge**. Ein Paar ist ein Tupel mit 2 Einträgen, ein Tripel mit 3.")
add(s + [FALLE], "Ist (a, (b, c)) dasselbe wie (a, b, c)?",
    "Nein. Links: 2 Einträge, der zweite ist selbst ein Paar. Rechts: 3 Einträge. Verschachtelung zählt.")
add(s, "Was bedeutet (aᵢ)ᵢ∈I und worauf musst du achten?",
    "Die Folge aller Glieder aᵢ mit Index i aus der Indexmenge I. Achte darauf, ob die Indizierung bei **0 oder 1** beginnt.")
add(s, "Unterschied **explizite** vs. **rekursive** Folgendefinition? Je ein Beispiel.",
    "- explizit: aᵢ = 2i ⇒ (0, 2, 4, 6) – Wert direkt aus i\n- rekursiv: a₀ = 1, aₙ₊₁ = aₙ + 3 ⇒ 1, 4, 7, 10 – braucht Vorgänger")
add(s, "Unterschied **geometrische Folge** vs. **geometrische Reihe**?",
    "- Folge: einzelne Werte, z. B. aₙ = 2ⁿ: 1, 2, 4, 8, …\n- Reihe: die **laufenden Summen** dieser Potenzen: 1, 3, 7, 15, …")
add(s, "Definition der **Fibonacci-Zahlen** und erste Glieder?",
    "F₀ = 0, F₁ = 1, Fₙ₊₂ = Fₙ₊₁ + Fₙ\n⇒ 0, 1, 1, 2, 3, 5, 8, 13, …")

s = [T3, "3.2-kartesisches-produkt"]
add(s, "Was ist das **kartesische Produkt** A × B? Beispiel A = {1, 2}, B = {a, b, c}.",
    "Alle geordneten Paare (x, y) mit x ∈ A, y ∈ B.\nA × B = {(1,a), (1,b), (1,c), (2,a), (2,b), (2,c)}")
add(s, "Wie groß ist |A × B| für endliche Mengen?", "|A × B| = |A| · |B|")
add(s + [FALLE], "Gilt A × B = B × A?",
    "Im Allgemeinen **nein**, da (1, a) ≠ (a, 1) – die Reihenfolge im Paar zählt.")
add(s + [FALLE], "Unterschied zwischen A × B × C und (A × B) × C?",
    "- A × B × C: Tripel (a, b, c)\n- (A × B) × C: verschachtelte Paare ((a, b), c)\n\nKlammern darf man nicht einfach weglassen.")
add(s, "Was ist ℝ² bzw. ℝ³?", "ℝ² = ℝ × ℝ: alle Koordinatenpaare (x, y) der Ebene; ℝ³: Tripel für Punkte im Raum.")

s = [T3, "3.3-wörter-alphabete"]
add(s, "Was ist ein **Alphabet**, was ein **Wort**?",
    "- Alphabet Σ: eine (endliche) Menge von Zeichen, z. B. {a, b}\n- Wort: Tupel von Zeichen ohne Klammern/Kommas geschrieben: (a, b, a) → aba")
add(s, "Was ist **ε**?", "Das **leere Wort** (Epsilon), das Wort ohne Zeichen. Länge |ε| = 0.")
add(s, "Was bedeuten **Σⁿ** und **Σ\\***?",
    "- Σⁿ: alle Wörter der Länge **genau n** über Σ (z. B. Σ² = {aa, ab, ba, bb})\n- Σ*: **alle endlichen** Wörter beliebiger Länge, inklusive ε (der Stern ist keine Multiplikation)")
add(s, "Wie viele Wörter der Länge n gibt es über einem Alphabet mit k Zeichen?",
    "**kⁿ** – pro Position eine von k Möglichkeiten. Bsp.: über {a, b} gibt es 2⁴ = 16 Wörter der Länge 4.")
add(s, "Ist ε ∈ Σ*?", "Ja – Σ* enthält alle endlichen Wörter, auch das leere.")
add(s, "Wie sieht Σ* als **Wortbaum** aus?",
    "Wurzel ε; jede Kante hängt **genau ein Zeichen rechts** an (ε → a, b; a → aa, ab; …). Auf Ebene n stehen alle Wörter der Länge n.")

s = [T3, "3.4-sprachen-konkatenation"]
add(s, "Was ist eine **(formale) Sprache** über Σ?",
    "Eine beliebige **Teilmenge von Σ\\***, also eine Menge von Wörtern. Kann unendlich sein, obwohl jedes Wort endlich ist.")
add(s, "Was ist die **Konkatenation** uv? Beispiel u = ab, v = baa.",
    "Hintereinanderschreiben: uv = abbaa, vu = baaab.")
add(s, "Welche Eigenschaften hat die Konkatenation von Wörtern?",
    "- **nicht kommutativ** (uv ≠ vu i. A.)\n- **assoziativ**: u(vw) = (uv)w\n- ε ist neutral: uε = εu = u\n- Längen addieren sich: |uv| = |u| + |v|")
add(s, "L = {a, ab}, M = {b, ba}. Bestimme LM.",
    "LM = {ab, aba, abb, abba} – je ein Wort aus L, gefolgt von einem aus M.")
add(s + [FALLE], "Unterschied zwischen LM und L × M?",
    "- LM: hintereinander geschriebene **Wörter**\n- L × M: **Paare** von Wörtern")

# ───────────────────────── 4 INDUKTION UND REKURSION ─────────────────────────
s = [T4, "4.1-peano-prinzip"]
add(s, "Was ist die wesentliche Struktur der natürlichen Zahlen (Peano-Idee)?",
    "Es gibt eine ausgezeichnete Zahl **0**, und jede Zahl hat einen **eindeutigen Nachfolger**. Die Darstellung (Striche, Binär, Mengen) ist egal.")
add(s, "Was besagt das **Induktionsaxiom**?",
    "Gilt eine Eigenschaft für **0** und überträgt sie sich stets von **n auf n + 1**, so gilt sie für **alle** natürlichen Zahlen.")
add(s, "Erkläre Induktion mit der **Domino-Analogie**.",
    "Der erste Stein fällt (Basis) und jeder fallende Stein stößt den nächsten um (Schritt) ⇒ alle fallen. **Beide** Bedingungen sind nötig.")

s = [T4, "4.2-induktionsbeweis"]
add(s, "Die drei Bausteine eines Induktionsbeweises?",
    "1. **Induktionsbasis (I.B.)**: zeige P(0) (bzw. P(1))\n2. **Induktionsannahme (I.A.)**: P(n) gelte für ein beliebiges, aber festes n\n3. **Induktionsschritt (I.S.)**: zeige daraus P(n + 1)")
add(s, "Warum heißt es im Induktionsschritt »**beliebig, aber fest**«?",
    "Der Übergang wird nicht nur für ein konkretes n (z. B. 3 → 4) gezeigt, sondern allgemein für **jedes** n – darum lässt er sich immer wieder anwenden.")
add(s + [FALLE], "Warum reichen 10 überprüfte Werte nicht als Beweis?",
    "Sie zeigen nur endlich viele Fälle. Ohne allgemeinen Induktionsschritt ist nicht gesichert, dass die Aussage für **alle** n gilt.")
add(s + [FALLE], "Was genau darfst du im Induktionsschritt annehmen?",
    "Nur **P(n)** für das eine feste n (bzw. bei starker Induktion alle P(k) für k ≤ n) – **nicht** die Behauptung für alle Zahlen.")
add(s, "Beweise: 1 + 2 + … + n = n(n + 1)/2 (Induktionsschritt).",
    "I.B. n = 1: 1 = 1·2/2 ✓\nI.S.: 1 + … + n + (n+1) =(I.A.) n(n+1)/2 + (n+1) = (n+1)(n/2 + 1) = **(n+1)(n+2)/2** ✓")
add(s, "a₀ = 0, aₙ₊₁ = 2aₙ + 1. Vermutung und Induktionsschritt?",
    "Werte: 0, 1, 3, 7, 15 ⇒ Vermutung **aₙ = 2ⁿ − 1**.\nI.S.: aₙ₊₁ = 2aₙ + 1 =(I.A.) 2(2ⁿ − 1) + 1 = 2ⁿ⁺¹ − 2 + 1 = **2ⁿ⁺¹ − 1** ✓")
add(s, "Was tun, wenn eine Aussage erst ab n = 1 (oder n₀) gilt?", "Die Induktionsbasis bei P(1) bzw. P(n₀) beginnen.")

s = [T4, "4.3-summen-produkte"]
add(s, "Was bedeutet Σₖ₌₀ⁿ aₖ? Berechne Σₖ₌₀³ 2ᵏ.",
    "a₀ + a₁ + … + aₙ.\nΣₖ₌₀³ 2ᵏ = 1 + 2 + 4 + 8 = **15**. (k ist nur Laufindex, umbenennbar.)")
add(s + [FALLE], "Welchen Wert haben die **leere Summe** und das **leere Produkt**?",
    "- leere Summe = **0**\n- leeres Produkt = **1**")
add(s, "Formel der **geometrischen Summe**?",
    "Für x ≠ 1: 1 + x + x² + … + xⁿ = **(1 − xⁿ⁺¹) / (1 − x)**\n(Beweis per Induktion: im Schritt den Summanden xⁿ⁺¹ dazunehmen.)")

s = [T4, "4.4-starke-induktion-fibonacci"]
add(s, "Was ist **starke Induktion**?",
    "Im Schritt darfst du annehmen, dass die Aussage für **alle** Zahlen von der Basis bis n gilt (nicht nur für n), und zeigst P(n + 1).")
add(s, "Beweisidee: Jede natürliche Zahl > 1 ist ein Produkt von Primzahlen.",
    "Starke Induktion. Fall 1: n + 1 prim ⇒ fertig. Fall 2: n + 1 = a · b mit kleineren a, b ≥ 2 ⇒ auf a und b die I.A. anwenden ⇒ Primfaktorzerlegung für n + 1.")
add(s, "Unterschied zwischen gewöhnlicher und starker Induktion?",
    "Nicht die Schlussfolgerung, sondern die **Stärke der Annahme**: statt nur P(n) stehen P(Basis), …, P(n) zur Verfügung. Beide sind gültig.")
add(s + [FALLE], "Warum braucht man bei Fibonacci-artigen Rekursionen meist **zwei** Basisfälle?",
    "Fₙ₊₂ hängt von **zwei** Vorgängern ab. Im Schritt nimmt man P(n) **und** P(n+1) an ⇒ man muss P(0) **und** P(1) als Basis zeigen.")
add(s, "Was ist eine **Schranke** und wie beweist man sie per Induktion?",
    "Eine Ungleichung statt exakter Formel (z. B. Fₙ ≤ cⁿ). I.A. in die Rekursion einsetzen und dann weiter **abschätzen** – endet mit einer Ungleichung.")

s = [T4, "4.5-strukturelle-induktion"]
add(s, "Parkettierungsproblem: 2ⁿ × 2ⁿ-Gitter mit einem fehlenden Feld mit L-Kacheln (3 Felder) belegen – Idee des Induktionsschritts?",
    "Gitter in **vier** 2ⁿ⁻¹ × 2ⁿ⁻¹-Teilgitter teilen. Das fehlende Feld liegt in einem davon. Eine L-Kachel in der **Mitte** bedeckt je ein Feld der drei anderen ⇒ in jedem Teilgitter fehlt genau ein Feld ⇒ I.A. viermal anwenden.")
add(s, "Wie begründet man |P(A)| = 2ⁿ induktiv?",
    "Ein Element herausnehmen: Jede Teilmenge enthält es oder nicht ⇒ doppelt so viele Teilmengen wie bei der um 1 kleineren Menge.")
add(s + [FALLE], "Wo ist der Fehler im »Alle Pferde haben dieselbe Farbe«-Beweis?",
    "Im Schritt von **n = 1 auf n = 2**: Die »ersten n« und »letzten n« Pferde überschneiden sich dann **nicht** – es gibt kein gemeinsames Pferd. Der Schritt gilt also nicht für alle n ab der Basis.")

# ───────────────────────── 5 RELATIONEN ─────────────────────────
s = [T5, "5.1-relationen-grundlagen"]
add(s, "Was ist eine **binäre Relation** zwischen A und B?",
    "Eine **Teilmenge von A × B**, also eine Menge geordneter Paare (nicht notwendig alle).")
add(s, "Was ist eine **k-stellige Relation**? Beispiel?",
    "Eine Menge von k-Tupeln. Bsp.: Tabelle (Person, Kurs, Note) = 3-stellige Relation – wichtig in Datenbanken.")
add(s, "Was macht die **Projektion π**?",
    "Wählt bestimmte **Spalten** einer Relation aus. Duplikate fallen weg (Relation = Menge).")
add(s, "Was macht ein **Join ▷◁** (laut Vorlesung)?",
    "Verbindet Zeilen zweier Relationen, wenn eine Gleichheitsbedingung (z. B. Index 1=1) erfüllt ist. Das Ergebnis enthält die Spalten **beider** Relationen – die verglichenen Spalten werden **nicht** automatisch entfernt.")
add(s, "Was ist eine **Endorelation**?", "Eine Relation R ⊆ A × A, also auf **einer** Grundmenge (Start und Ziel aus derselben Menge).")
add(s, "Was bedeutet **a R b**?", "Kurzschreibweise für (a, b) ∈ R: »a steht in Relation zu b«.")
add(s, "Was ist **Rᵀ** (transponierte/umgekehrte Relation)?", "Alle Paare umgedreht: (a, b) ∈ R ⇔ (b, a) ∈ Rᵀ.")
add(s, "Was ist die **Identitätsrelation** Id_A?", "Id_A = {(a, a) | a ∈ A} – jedes Element nur mit sich selbst verbunden.")
add(s, "Relation »<« auf {1, 2, 3} als Paarmenge?", "{(1, 2), (1, 3), (2, 3)}")

s = [T5, "5.2-darstellung-graph-matrix"]
add(s, "Wie stellt man eine Endorelation als **gerichteten Graphen** dar?",
    "Elemente = Knoten, Paar (a, b) = Pfeil von a nach b, Paar (a, a) = **Schleife** an a. Die Lage der Knoten ist egal.")
add(s, "Wie stellt man eine endliche Relation als **0-1-Matrix** dar?",
    "Zeile = Startobjekt, Spalte = Zielobjekt; Eintrag **1**, wenn das Paar in R liegt, sonst 0.")
add(s + [FALLE], "Ist die Matrix einer Relation eindeutig?",
    "Nein – sie hängt von der **Reihenfolge** ab, in der die Elemente aufgelistet werden. Dieselbe Relation kann verschieden angeordnete Matrizen haben.")
add(s, "Was passiert mit der Matrix beim Übergang zu Rᵀ?", "Sie wird **transponiert** (Zeilen ↔ Spalten).")

s = [T5, "5.3-relationales-produkt"]
add(s, "Definition des **relationalen Produkts** RS?",
    "(x, z) ∈ RS ⇔ **∃ y**: (x, y) ∈ R ∧ (y, z) ∈ S\n»Erst ein R-Schritt, dann ein S-Schritt.«")
add(s, "R = {(a, b)}, S = {(b, c)}. Was ist RS, was SR?", "RS = {(a, c)}, SR = ∅.")
add(s + [FALLE], "Unterschied zwischen relationalem Produkt RS und kartesischem Produkt R × S?",
    "- R × S: Paare **von Paaren**\n- RS: verkettet Beziehungen über ein gemeinsames Zwischenelement")
add(s, "Wie drückt man RS mit Datenbankoperationen aus?",
    "**Join** mit Bedingung »2. Spalte von R = 1. Spalte von S«, danach **Projektion** auf die allererste und allerletzte Spalte.")
add(s, "Rechenregeln des relationalen Produkts?",
    "- **assoziativ**: (RS)T = R(ST)\n- **nicht kommutativ**: RS ≠ SR i. A.\n- **Id neutral**: Id_A R = R = R Id_B\n- distributiv über **Vereinigung** (nicht analog über Schnitt)")
add(s, "Was bedeuten **R⁰, R², Rⁿ**?",
    "- R⁰ = Id_A (null Schritte)\n- R² = RR (genau zwei Schritte)\n- Rⁿ = genau n Schritte hintereinander")
add(s + [FALLE], "Bedeutet R², dass die Zahlen in den Paaren quadriert werden?",
    "**Nein!** R² = R zweimal **hintereinander** ausführen.")
add(s, "R = {(a, b), (b, c)}. Bestimme R².", "R² = {(a, c)}. (a, c) muss dabei nicht in R selbst liegen.")
add(s, "Wie drückt man »in **höchstens** n Schritten erreichbar« aus?", "R⁰ ∪ R¹ ∪ … ∪ Rⁿ")
add(s, "Satz: |A| = n. Wenn b von a aus erreichbar ist, dann …?",
    "… auch mit **weniger als n Schritten**. Ein längerer Weg besucht einen Knoten doppelt; den Kreis dazwischen kann man überspringen.")
add(s, "Was ist die »**Methode des kleinsten Verbrechers**«?",
    "Annahme: Es gibt ein (kürzestes/kleinstes) Gegenbeispiel. Daraus ein noch kleineres konstruieren ⇒ Widerspruch. Eng verwandt mit starker Induktion.")

s = [T5, "5.4-eigenschaften"]
add(s, "Wann ist R auf A **reflexiv**? (Graph-Bild)",
    "∀x ∈ A: (x, x) ∈ R – **jeder** Knoten hat eine Schleife. Fehlt eine einzige, ist R nicht reflexiv.")
add(s, "Wann ist R **irreflexiv**?", "**Kein** Knoten hat eine Schleife: ∀x: (x, x) ∉ R. Bsp.: »<«.")
add(s + [FALLE], "Ist »nicht reflexiv« dasselbe wie »irreflexiv«?",
    "Nein. Haben nur **einige** Knoten eine Schleife, ist R **weder** reflexiv **noch** irreflexiv.")
add(s, "Wann ist R **symmetrisch**?", "x R y ⇒ y R x – zu jedem Pfeil gibt es den Rückpfeil. Bsp.: »hat dieselbe Schuhgröße wie«.")
add(s, "Wann ist R **antisymmetrisch**?",
    "(x R y ∧ y R x) ⇒ x = y – zwischen **verschiedenen** Elementen nie Pfeile in beide Richtungen. Schleifen sind erlaubt. Bsp.: ≤.")
add(s, "Wann ist R **asymmetrisch**?", "x R y ⇒ ¬(y R x) – keine Rückpfeile **und keine Schleifen**. Bsp.: <.")
add(s + [FALLE], "Zusammenhang **asymmetrisch** – **antisymmetrisch** – **irreflexiv**?",
    "asymmetrisch ⇔ antisymmetrisch **und** irreflexiv.\nAsymmetrisch ⇒ antisymmetrisch, aber **nicht** umgekehrt (≤ ist antisymmetrisch, nicht asymmetrisch).")
add(s, "Wann ist R **transitiv**? Kurzform als Relationsinklusion?",
    "(x R y ∧ y R z) ⇒ x R z – aus x → y → z folgt direkte Kante x → z.\nKurz: **RR ⊆ R**")
add(s, "Eigenschaften von **=** auf ℤ?",
    "reflexiv, symmetrisch, antisymmetrisch, transitiv. **Nicht** irreflexiv, **nicht** asymmetrisch.")
add(s, "Eigenschaften von **≤** und **<**?",
    "- ≤: reflexiv, antisymmetrisch, transitiv (nicht symmetrisch)\n- <: irreflexiv, asymmetrisch, transitiv")
add(s + [FALLE], "Eigenschaften von **≠**? Gegenbeispiel zur Transitivität?",
    "symmetrisch, irreflexiv, **nicht transitiv**: x = 1, y = 2, z = 1 ⇒ 1 ≠ 2, 2 ≠ 1, aber nicht 1 ≠ 1.")
add(s, "Eigenschaften der **Teilbarkeit** | auf ℕ (positiv)?", "reflexiv, antisymmetrisch, transitiv ⇒ partielle Ordnung.")
add(s, "Was bedeuten **Präfix, Suffix, Infix** – und welche Eigenschaften haben diese Relationen?",
    "u ist Präfix/Suffix/Infix von v, wenn v mit u **beginnt/endet** bzw. u **zusammenhängend irgendwo** in v vorkommt.\nAlle drei: reflexiv, antisymmetrisch, transitiv.")
add(s, "Was ist die **Konjugation** von Wörtern?",
    "Zwei Wörter, die durch Vertauschen zweier Wortblöcke ineinander übergehen (uv ↔ vu). Beispiel einer **Äquivalenzrelation**.")
add(s, "Prüfrezept: Wie prüfst du Reflexivität, Symmetrie, Antisymmetrie, Transitivität einer definierten Relation?",
    "- **Reflexiv**: y = x einsetzen, für alle x prüfen\n- **Symmetrisch**: x und y vertauschen, Bedingung vergleichen\n- **Antisymmetrisch**: verschiedene x, y suchen, für die beide Richtungen gelten\n- **Transitiv**: x R y und y R z annehmen, x R z folgern\n\nWiderlegen: **ein** Gegenbeispiel, das alle Voraussetzungen erfüllt.")

s = [T5, "5.5-abschlüsse-invarianten"]
add(s, "Was ist der **transitive Abschluss R⁺**?",
    "R⁺ = R ∪ R² ∪ R³ ∪ … – erreichbar in **mindestens einem** (endlich vielen) Schritt.")
add(s, "Was ist der **reflexiv-transitive Abschluss R\\***?",
    "R* = Id_A ∪ R⁺ – erreichbar in **null oder mehr** Schritten. R* ist reflexiv und transitiv.")
add(s + [FALLE], "Unterschied zwischen R⁺ und R\\*?", "R* erlaubt zusätzlich **null Schritte**: R* = Id_A ∪ R⁺.")
add(s, "Wichtiger Satz (Folie 101): X reflexiv und transitiv, R ⊆ X. Was folgt?",
    "**R\\* ⊆ X.**\nX enthält jeden R-Schritt, wegen Transitivität jede Verkettung, wegen Reflexivität die null Schritte.")
add(s, "Wozu nutzt man den Satz »R ⊆ X, X reflexiv + transitiv ⇒ R* ⊆ X«?",
    "Um **Unerreichbarkeit** zu beweisen: Finde eine einfache Relation X (Invariante), die alle Schritte enthält. Liegt (Start, Ziel) nicht in X, ist das Ziel nicht erreichbar – ohne alle Wege durchzuprobieren.")
add(s, "Was ist eine **Invariante**? Beispiel?",
    "Eine Eigenschaft, die bei **jedem erlaubten Schritt erhalten** bleibt. Bsp.: Start gerade, Schritte ±4 ⇒ Zahl bleibt immer gerade ⇒ ungerade Zahlen unerreichbar.")
add(s, "**MU-Puzzle**: Alphabet, Start, vier Regeln?",
    "Σ = {M, I, U}, Start **MI**.\n1. xI → xIU (U anhängen, wenn auf I endet)\n2. Mx → Mxx (Rest verdoppeln)\n3. III → U\n4. UU → (löschen)\n\nFrage: Ist **MU** erreichbar?")
add(s, "MU-Puzzle: Welche Invariante zeigt, dass MU **nicht** erreichbar ist?",
    "Ob die Anzahl der I (|w|_I) **durch 3 teilbar** ist.\n- Regel 1, 4: I-Anzahl unverändert\n- Regel 2: verdoppelt (nicht durch 3 teilbar bleibt nicht durch 3 teilbar)\n- Regel 3: −3\nMI: |w|_I = 1 (nicht teilbar), MU: 0 (teilbar) ⇒ unerreichbar.")
add(s, "Wie wird die MU-Invariante als Relation X formuliert?",
    "(u, w) ∈ X ⇔ |u|_I und |w|_I sind **beide** durch 3 teilbar oder **beide nicht**. X ist reflexiv + transitiv und R ⊆ X ⇒ R* ⊆ X. Wichtig: Es geht nicht um gleiche I-Anzahl, nur um die Kategorie.")
add(s, "Was beschreibt R\\* bei Programmen?",
    "Beschreibt R einen **Schleifendurchlauf**, so beschreibt R* den Effekt **beliebig vieler** (endlich vieler, auch null) Durchläufe. Invarianten zeigen, dass Zustände nie erreicht werden.")

s = [T5, "5.6-äquivalenzrelationen"]
add(s, "Definition **Äquivalenzrelation**?", "Eine Relation, die **reflexiv, symmetrisch und transitiv** ist.")
add(s + [FALLE], "Gehört Antisymmetrie zur Definition einer Äquivalenzrelation?", "**Nein** – Antisymmetrie gehört zu den (partiellen) **Ordnungen**.")
add(s, "Was drückt eine Äquivalenzrelation intuitiv aus?",
    "Eine **abstrahierte Gleichheit**: Objekte gelten in einer bestimmten Hinsicht als gleichwertig (z. B. gleicher Geburtsmonat), ohne identisch zu sein.")
add(s, "Was bedeutet **a ≡ b (mod m)**? (zwei Formulierungen)",
    "- a und b haben bei Division durch m **denselben Rest**\n- äquivalent: **m teilt a − b**")
add(s, "Warum ist »≡ mod m« eine Äquivalenzrelation?",
    "- reflexiv: a hat denselben Rest wie a\n- symmetrisch: gleicher Rest gilt in beide Richtungen\n- transitiv: a ~ b, b ~ c ⇒ a, c haben denselben Rest")
add(s, "Was ist die **Äquivalenzklasse [a]_R**?", "[a]_R = {x | x R a} – alle Elemente, die zu a äquivalent sind.")
add(s, "Gib [1] modulo 3 an.", "[1] = {…, −5, −2, 1, 4, 7, 10, …} – alle ganzen Zahlen mit Rest 1 bei Division durch 3.")
add(s, "Warum gehören 4 und 10 zur selben Restklasse mod 3?", "Beide haben Rest 1 (bzw. 3 teilt 10 − 4 = 6).")
add(s, "Welche zwei Eigenschaften haben Äquivalenzklassen untereinander?",
    "- Liegt b in [a], so ist **[a] = [b]**\n- Verschiedene Klassen sind **disjunkt**")
add(s, "Was ist die **Quotientenmenge A/R**? Beispiel?",
    "Die Menge **aller Äquivalenzklassen**. ℤ mod 3 = {[0], [1], [2]} – genau drei Klassen.")
add(s, "Zusammenhang **Äquivalenzrelation ↔ Partition**?",
    "- Die Äquivalenzklassen einer Äquivalenzrelation bilden eine **Partition** der Grundmenge\n- Umgekehrt: Jede Partition definiert eine Äquivalenzrelation (»liegen im selben Block«)\n\nZwei Sichten auf dieselbe Struktur.")
add(s, "Nenne drei Partitionen von {a, b, c}.", "{{a}, {b}, {c}}, {{a, b}, {c}}, {{a, b, c}} (insgesamt gibt es 5).")
add(s, "Was ist ein **Repräsentantensystem**?",
    "Eine Auswahl von **genau einem Vertreter** aus jeder Äquivalenzklasse. Mod 3: z. B. {0, 1, 2} oder {3, 4, 5}.")
add(s, "Was ist **semantische Äquivalenz** von Ausdrücken/Programmen? Ist sie entscheidbar?",
    "Gleicher Wert/gleiches Verhalten für jede Eingabe trotz verschiedener Schreibweise, z. B. (x+y)² und x² + 2xy + y².\nFür beliebige Programme ist das **im Allgemeinen nicht algorithmisch entscheidbar**.")
add(s, "Wie baut man aus beliebigem S eine Äquivalenzrelation (Zusammenhang)?",
    "**(S ∪ Sᵀ)\\*** – Pfeile in beide Richtungen erlauben, dann reflexiv-transitiver Abschluss ⇒ Zusammenhangsgruppen.")
add(s, "Welche Äquivalenzrelation beschreibt **gegenseitige Erreichbarkeit**?", "**S\\* ∩ (Sᵀ)\\*** – x und y sind voneinander aus erreichbar.")
add(s + [FALLE], "Ist der Schnitt bzw. die Vereinigung zweier Äquivalenzrelationen wieder eine?",
    "- **Schnitt: ja** (z. B. gleicher Studiengang UND gleicher Jahrgang)\n- **Vereinigung: nicht unbedingt** – sie ist i. A. nicht transitiv")

s = [T5, "5.7-ordnungen-hasse"]
add(s, "Definition **partielle Ordnung**?", "Eine Relation, die **reflexiv, antisymmetrisch und transitiv** ist.")
add(s + [FALLE], "Was bedeutet »**partiell**« bei partiellen Ordnungen?",
    "**Nicht**, dass Eigenschaften fehlen – sondern dass **nicht jedes Paar vergleichbar** sein muss.")
add(s, "Nenne drei partielle Ordnungen, die **nicht total** sind.",
    "- Teilbarkeit | auf ℕ (2 und 3 unvergleichbar)\n- Teilmenge ⊆ ({1} und {2} unvergleichbar)\n- Präfixrelation auf Wörtern (ab und ba unvergleichbar)")
add(s, "Wann sind a, b **vergleichbar**? Was ist eine **Totalordnung**?",
    "a, b vergleichbar ⇔ a R b oder b R a.\nTotal-/lineare Ordnung: partielle Ordnung, in der **alle** Paare vergleichbar sind (z. B. ≤ auf ℝ).")
add(s, "Definition **strikte Ordnung**?", "Eine **asymmetrische und transitive** Relation, z. B. < oder ⊊.")
add(s, "Wie gewinnt man aus einer partiellen Ordnung die strikte – und umgekehrt?",
    "- partiell → strikt: **Selbstpaare entfernen** (≤ → <, ⊆ → ⊊)\n- strikt → partiell: **Identität ergänzen**")
add(s, "Was ist die **duale Ordnung**?", "Alle Pfeile umkehren (Rᵀ) – wieder eine partielle Ordnung. ≤ → ≥, »teilt« → »ist Vielfaches von«.")
add(s, "Was lässt ein **Hasse-Diagramm** weg?",
    "- alle **Schleifen** (Reflexivität)\n- alle **transitiven Kanten** (die sich über kürzere Wege ergeben)\nRichtung = Höhe: kleinere Elemente unten, daher keine Pfeilspitzen.")
add(s, "Formale Idee des Hasse-Diagramms?", "Eine möglichst kleine Relation S mit **S\\* = R** – aus ihr lässt sich die ganze Ordnung rekonstruieren.")
add(s, "Hasse-Diagramm von (P({a, b}), ⊆)?",
    "Unten ∅, darüber nebeneinander {a} und {b} (unvergleichbar), oben {a, b}. Kanten: ∅–{a}, ∅–{b}, {a}–{a,b}, {b}–{a,b}. Keine direkte Kante ∅–{a,b}.")
add(s, "Wie liest man Vergleichbarkeit im Hasse-Diagramm ab?",
    "a ≤ b ⇔ es gibt einen **aufsteigenden Weg** von a nach b. Gibt es in keiner Richtung einen, sind a und b unvergleichbar.")
add(s, "Warum ist die Präfixordnung eine partielle, aber keine totale Ordnung?",
    "reflexiv (u Präfix von u), antisymmetrisch (gegenseitig Präfix ⇒ gleich), transitiv. Aber **a und b** sind unvergleichbar.")
add(s, "Wie funktioniert die **lexikographische Ordnung**?",
    "- Das **erste unterschiedliche Zeichen** entscheidet (ab < ba)\n- Ist ein Wort Präfix des anderen, kommt das **kürzere** zuerst (ab < aba)\n\nBei total geordnetem Alphabet ist sie **total**.")
add(s, "Ordne lexikographisch: ba, aba, ab (a < b).", "**ab < aba < ba**")
add(s + [FALLE], "Gemeinsamkeit und Unterschied **Äquivalenzrelation vs. partielle Ordnung**?",
    "Beide: **reflexiv und transitiv**.\n- Äquivalenzrelation: zusätzlich **symmetrisch** (fasst zu Klassen zusammen)\n- partielle Ordnung: zusätzlich **antisymmetrisch** (gerichteter Vergleich)")
add(s, "Wofür sind partielle Ordnungen in der Praxis nützlich?",
    "Für **Abhängigkeiten**: manche Schritte müssen vor anderen kommen, unabhängige Schritte dürfen in beliebiger Reihenfolge erfolgen.")

# ───────────────────────── FACHBEGRIFFE & SYMBOLE (je Überthema) ─────────────────────────
FB = "fachbegriffe"
def terms(top, sub, pairs):
    for f, b in pairs:
        add([top, sub, FB], f, b)

terms(T1, "1.0-fachbegriffe-logik", [
    ("Fachbegriff: **Junktor**", "Logischer Verknüpfungsoperator, der Aussagen zu neuen Aussagen verbindet: ¬, ∧, ∨, →, ↔ (auch XOR)."),
    ("Fachbegriff: **Konjunktion**", "Die UND-Verknüpfung **A ∧ B** – wahr genau dann, wenn beide wahr sind."),
    ("Fachbegriff: **Disjunktion**", "Die (einschließende) ODER-Verknüpfung **A ∨ B** – wahr, wenn mindestens eine wahr ist."),
    ("Fachbegriff: **Negation**", "Die Verneinung **¬A** – kehrt den Wahrheitswert um."),
    ("Fachbegriff: **Implikation**", "**A → B**, »wenn A, dann B«. Falsch nur bei A wahr, B falsch."),
    ("Fachbegriff: **Äquivalenz (Bikonditional)**", "**A ↔ B**, »A genau dann, wenn B« – beide Richtungen der Implikation gelten."),
    ("Fachbegriff: **exklusives Oder (XOR)**", "»entweder A oder B« – wahr, wenn **genau eine** der Aussagen wahr ist."),
    ("Fachbegriffe: **Prämisse/Voraussetzung** und **Konklusion/Folgerung** bei A → B?", "A ist die Voraussetzung (Prämisse), B die Folgerung (Konklusion)."),
    ("Fachbegriff: **Quantor**", "Operator, der angibt, für wie viele Elemente eine Aussageform gelten soll: **∀** (Allquantor) und **∃** (Existenzquantor)."),
    ("Fachbegriff: **Allquantor**", "**∀**, »für alle« – Aussage muss für jedes Element des Bereichs gelten."),
    ("Fachbegriff: **Existenzquantor**", "**∃**, »es existiert mindestens ein« – ein Zeuge genügt."),
    ("Fachbegriff: **beschränkter Quantor**", "Quantor über einen eingeschränkten Bereich: ∀x: R(x) → P(x) bzw. ∃x: R(x) ∧ P(x)."),
    ("Fachbegriff: **Zeuge**", "Ein konkretes Element, das eine Existenzaussage belegt (z. B. n = 3 für ∃n: n² = 9)."),
    ("Fachbegriff: **Gegenbeispiel**", "Ein konkretes Element, das eine All-Aussage **widerlegt**."),
    ("Fachbegriffe: **Aussage** vs. **Aussageform**", "Aussage: hat Wahrheitswert. Aussageform: enthält freie Variable(n), erst nach Belegung bewertbar."),
    ("Fachbegriff: **erfüllbar**", "In mindestens einer zulässigen Belegung wahr."),
    ("Fachbegriff: **allgemeingültig**", "In **jeder** zulässigen Belegung wahr."),
    ("Fachbegriff: **Wahrheitstabelle**", "Tabelle, die für alle Kombinationen der Wahrheitswerte der Teilaussagen den Wert eines Ausdrucks angibt (bei n Aussagen 2ⁿ Zeilen)."),
    ("Fachbegriffe: **hinreichend** / **notwendig**", "Bei A → B: A ist **hinreichende** Bedingung für B, B ist **notwendige** Bedingung für A."),
    ("Fachbegriff: **direkter Beweis**", "A annehmen und daraus B herleiten."),
    ("Fachbegriff: **Kontraposition**", "Beweis von A → B über die gleichwertige Aussage **¬B → ¬A**."),
    ("Fachbegriff: **Widerspruchsbeweis (indirekter Beweis)**", "Negation der Behauptung annehmen, Widerspruch herleiten, Behauptung folgern."),
    ("Fachbegriff: **Lemma**", "Hilfssatz – Zwischenergebnis für einen größeren Beweis."),
    ("Fachbegriff: **Korollar**", "Eher direkte Folgerung aus einem Satz."),
    ("Fachbegriff: **Theorem / Satz**", "Eine relevante, bewiesene mathematische Aussage."),
    ("Symbol → Name: **¬  ∧  ∨  →  ↔**", "Negation, Konjunktion, Disjunktion, Implikation, Äquivalenz (Bikonditional)."),
    ("Symbol → Name: **∀  ∃**", "Allquantor (»für alle«), Existenzquantor (»es gibt mindestens ein«)."),
])

terms(T2, "2.0-fachbegriffe-mengen", [
    ("Fachbegriff: **Element**", "Ein Objekt, das zu einer Menge gehört: a ∈ A."),
    ("Fachbegriff: **leere Menge**", "**∅** bzw. {} – die Menge ohne Elemente."),
    ("Fachbegriff: **Teilmenge**", "**A ⊆ B**: jedes Element von A liegt in B."),
    ("Fachbegriff: **echte Teilmenge**", "**A ⊊ B**: A ⊆ B und A ≠ B."),
    ("Fachbegriff: **Grundmenge / Universum**", "Die festgelegte Gesamtmenge **Ω**, aus der Elemente stammen; nötig für das Komplement."),
    ("Fachbegriff: **Aussonderung (Auswahl)**", "Mengendefinition durch Eigenschaft: {x ∈ A | P(x)}."),
    ("Fachbegriff: **Ersetzung**", "Mengendefinition durch Bildung neuer Werte: {f(x) | x ∈ A}, z. B. {2x | x ∈ {1,2,3}}."),
    ("Fachbegriff: **Russellsche Antinomie**", "Paradox der »Menge aller Mengen, die sich nicht selbst enthalten« – Grund für saubere Aussonderung aus Grundmengen."),
    ("Fachbegriff: **Vereinigung**", "**A ∪ B**: Elemente in A **oder** B."),
    ("Fachbegriff: **Schnitt (Durchschnitt)**", "**A ∩ B**: Elemente in A **und** B."),
    ("Fachbegriff: **Differenz**", "**A \\ B**: Elemente in A, aber nicht in B."),
    ("Fachbegriff: **symmetrische Differenz**", "**A Δ B** = (A \\ B) ∪ (B \\ A): in genau einer der beiden Mengen."),
    ("Fachbegriff: **Komplement**", "Alle Elemente des Universums Ω, die nicht in A liegen (Ω \\ A)."),
    ("Fachbegriff: **disjunkt**", "Zwei Mengen sind disjunkt, wenn A ∩ B = ∅. »Paarweise disjunkt«: je zwei verschiedene Mengen einer Familie sind disjunkt."),
    ("Fachbegriff: **Kardinalität (Mächtigkeit)**", "**|A|** – Anzahl verschiedener Elemente einer endlichen Menge."),
    ("Fachbegriff: **Potenzmenge**", "**P(A)** bzw. **2^A** – Menge aller Teilmengen von A; |P(A)| = 2^|A|."),
    ("Fachbegriff: **Mengenfamilie**", "Eine Menge (indizierte Sammlung) von Mengen, über die man ⋃ und ⋂ bildet."),
    ("Fachbegriff: **Partition**", "Zerlegung einer Menge in nicht leere, paarweise disjunkte Blöcke, die zusammen die Menge ergeben."),
    ("Fachbegriff: **Kommutativität / Assoziativität / Distributivität** (Mengen)", "Kommutativ: A ∪ B = B ∪ A. Assoziativ: (A ∪ B) ∪ C = A ∪ (B ∪ C). Distributiv: A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)."),
    ("Fachbegriff: **De-Morgan-Regeln**", "Komplement eines Schnitts = Vereinigung der Komplemente und umgekehrt (analog ¬(A ∧ B) ≡ ¬A ∨ ¬B)."),
    ("Fachbegriff: **Venn-Diagramm**", "Bild, in dem Mengen als sich überlappende Flächen dargestellt werden."),
    ("Fachbegriff: **KV-Diagramm (Karnaugh-Veitch)**", "Tabellarisches Diagramm, das alle 2ⁿ Ja/Nein-Kombinationen der Zugehörigkeit zu n Mengen als Felder anordnet."),
    ("Symbol → Name: **∈  ∉  ⊆  ⊊  ∅**", "ist Element von, ist kein Element von, Teilmenge, echte Teilmenge, leere Menge."),
    ("Symbol → Name: **∪  ∩  \\  Δ  ⋃  ⋂**", "Vereinigung, Schnitt, Differenz, symmetrische Differenz, große Vereinigung, großer Schnitt."),
    ("Symbol → Name: **|A|,  P(A) bzw. 2^A,  Ω**", "Kardinalität, Potenzmenge, Universum/Grundmenge."),
    ("Symbol → Name: **ℕ  ℕ₀  ℤ  ℚ  ℝ**", "natürliche Zahlen (ab 1), natürliche Zahlen mit 0, ganze, rationale, reelle Zahlen."),
])

terms(T3, "3.0-fachbegriffe-folgen-wörter", [
    ("Fachbegriff: **Folge**", "Geordnete Auflistung (a₀, a₁, …) – Reihenfolge und Wiederholungen zählen."),
    ("Fachbegriff: **Tupel**", "Endliche Folge, z. B. (a, b, c). Bezeichnung nach Länge: Paar (2), Tripel (3), n-Tupel."),
    ("Fachbegriff: **geordnetes Paar**", "(a, b) – Tupel mit zwei Einträgen; (a, b) ≠ (b, a) für a ≠ b."),
    ("Fachbegriff: **Index / Indexmenge**", "Der Index i gibt die Position an; die Indexmenge I enthält alle erlaubten Indizes: (aᵢ)ᵢ∈I."),
    ("Fachbegriff: **explizite Definition** (Folge)", "Glied direkt aus dem Index berechenbar, z. B. aᵢ = 2i."),
    ("Fachbegriff: **rekursive Definition** (Folge)", "Glied wird aus Vorgängern berechnet, mit Startwert(en), z. B. a₀ = 1, aₙ₊₁ = aₙ + 3."),
    ("Fachbegriff: **geometrische Folge / geometrische Reihe**", "Folge: aₙ = qⁿ (einzelne Werte). Reihe: die aufsummierten Werte 1 + q + … + qⁿ."),
    ("Fachbegriff: **kartesisches Produkt**", "**A × B** = {(a, b) | a ∈ A, b ∈ B} – Menge aller geordneten Paare."),
    ("Fachbegriff: **Alphabet**", "Eine (endliche) Menge von Zeichen, geschrieben **Σ**."),
    ("Fachbegriff: **Wort**", "Endliche Zeichenfolge über einem Alphabet (Tupel ohne Klammern/Kommas)."),
    ("Fachbegriff: **leeres Wort**", "**ε** (Epsilon) – Wort der Länge 0."),
    ("Fachbegriff: **Länge eines Wortes**", "**|w|** – Anzahl der Zeichen; |ε| = 0, |uv| = |u| + |v|."),
    ("Fachbegriff: **Kleene-Stern Σ\\***", "Menge aller endlichen Wörter über Σ (inkl. ε)."),
    ("Fachbegriff: **(formale) Sprache**", "Eine Teilmenge L ⊆ Σ*."),
    ("Fachbegriff: **Konkatenation**", "Hintereinanderschreiben von Wörtern (uv) bzw. Sprachen (LM)."),
    ("Fachbegriffe: **Präfix, Suffix, Infix**", "u ist Präfix von v: v beginnt mit u. Suffix: v endet mit u. Infix: u kommt zusammenhängend in v vor."),
    ("Fachbegriff: **Wortbaum**", "Baumdarstellung von Σ*: Wurzel ε, jede Kante hängt ein Zeichen rechts an."),
    ("Symbol → Name: **Σ  Σⁿ  Σ\\*  ε  |w|**", "Alphabet, Wörter der Länge n, alle endlichen Wörter, leeres Wort, Wortlänge."),
    ("Symbol → Name: **×  ℝ²  (a, b)**", "kartesisches Produkt, ℝ × ℝ (Ebene), geordnetes Paar."),
])

terms(T4, "4.0-fachbegriffe-induktion", [
    ("Fachbegriff: **Peano-Axiome**", "Axiome der natürlichen Zahlen: ausgezeichnete 0, eindeutiger Nachfolger, Induktionsaxiom."),
    ("Fachbegriff: **Nachfolger**", "Die nächste natürliche Zahl n + 1 zu n."),
    ("Fachbegriff: **Induktionsaxiom**", "Gilt P(0) und P(n) ⇒ P(n+1) für alle n, so gilt P(n) für alle n ∈ ℕ₀."),
    ("Fachbegriff: **vollständige Induktion**", "Beweisverfahren aus Induktionsbasis und Induktionsschritt für Aussagen über alle natürlichen Zahlen."),
    ("Fachbegriff: **Induktionsbasis (I.B.)** / Induktionsanfang", "Nachweis der Aussage für den Startwert (P(0) oder P(1))."),
    ("Fachbegriff: **Induktionsannahme (I.A.)** / Induktionsvoraussetzung", "Die im Schritt erlaubte Annahme, dass P(n) für ein beliebiges, festes n gilt."),
    ("Fachbegriff: **Induktionsbehauptung**", "Die im Schritt zu zeigende Aussage P(n + 1)."),
    ("Fachbegriff: **Induktionsschritt (I.S.)**", "Der Nachweis P(n) ⇒ P(n + 1) für beliebiges, festes n."),
    ("Fachbegriff: **starke (vollständige) Induktion**", "Induktion, bei der im Schritt P(k) für **alle** k ≤ n angenommen werden darf."),
    ("Fachbegriff: **strukturelle Induktion**", "Induktion über Größe/Aufbau von Objekten (Gitter, Wörter, Mengen, Programme) statt über eine Zahl direkt."),
    ("Fachbegriff: **Rekursion / Rekursionsvorschrift**", "Definition eines Wertes über vorherige Werte, z. B. aₙ₊₁ = 2aₙ + 1."),
    ("Fachbegriff: **Fibonacci-Zahlen**", "F₀ = 0, F₁ = 1, Fₙ₊₂ = Fₙ₊₁ + Fₙ."),
    ("Fachbegriff: **Schranke** (obere/untere)", "Ungleichung, die eine Größe nach oben bzw. unten begrenzt, statt sie exakt anzugeben."),
    ("Fachbegriff: **Laufindex**", "Die Summations-/Produktvariable (z. B. k in Σₖ₌₀ⁿ) – frei umbenennbar."),
    ("Fachbegriffe: **leere Summe / leeres Produkt**", "Summe ohne Summanden = 0, Produkt ohne Faktoren = 1."),
    ("Fachbegriff: **geometrische Summe**", "Σₖ₌₀ⁿ xᵏ = (1 − xⁿ⁺¹)/(1 − x) für x ≠ 1."),
    ("Fachbegriff: **Primfaktorzerlegung**", "Darstellung einer Zahl > 1 als Produkt von Primzahlen (Existenz per starker Induktion)."),
    ("Symbol → Name: **Σ (groß) und Π**", "Summenzeichen und Produktzeichen."),
    ("Abkürzungen **I.B., I.A., I.S.**", "Induktionsbasis, Induktionsannahme, Induktionsschritt."),
])

terms(T5, "5.0-fachbegriffe-relationen", [
    ("Fachbegriff: **Relation**", "Eine Menge von Tupeln; binär: R ⊆ A × B."),
    ("Fachbegriff: **binäre / k-stellige Relation**", "binär: Menge von Paaren; k-stellig: Menge von k-Tupeln."),
    ("Fachbegriff: **Endorelation**", "Relation R ⊆ A × A auf einer einzigen Grundmenge."),
    ("Fachbegriff: **Projektion**", "**π** – Auswahl bestimmter Spalten einer Relation."),
    ("Fachbegriff: **Join (Verbund)**", "**▷◁** – Verbinden von Zeilen zweier Relationen mit gleichen Werten in angegebenen Spalten."),
    ("Fachbegriff: **transponierte / inverse Relation**", "**Rᵀ** – alle Paare umgedreht."),
    ("Fachbegriff: **Identitätsrelation**", "**Id_A** = {(a, a) | a ∈ A}."),
    ("Fachbegriffe: **Nachfolger / Vorgänger** (Relation)", "Nachfolger von a: alle b mit (a, b) ∈ R. Vorgänger: alle b mit (b, a) ∈ R."),
    ("Fachbegriff: **Adjazenzmatrix (0-1-Matrix)**", "Matrix mit 1 an Stelle (x, y) genau dann, wenn (x, y) ∈ R."),
    ("Fachbegriff: **Schleife**", "Kante (a, a) von einem Knoten zu sich selbst."),
    ("Fachbegriff: **relationales Produkt / Komposition**", "**RS** = {(x, z) | ∃y: x R y ∧ y S z}."),
    ("Fachbegriff: **Relationenpotenz**", "**Rⁿ** – R n-mal hintereinander; R⁰ = Id."),
    ("Fachbegriff: **Erreichbarkeit**", "b ist von a aus erreichbar, wenn (a, b) ∈ R* (Weg aus endlich vielen Schritten)."),
    ("Fachbegriffe: **reflexiv / irreflexiv**", "reflexiv: ∀x: x R x. irreflexiv: ∀x: ¬(x R x)."),
    ("Fachbegriffe: **symmetrisch / antisymmetrisch / asymmetrisch**", "symm.: x R y ⇒ y R x. antisymm.: x R y ∧ y R x ⇒ x = y. asymm.: x R y ⇒ ¬(y R x)."),
    ("Fachbegriff: **transitiv**", "x R y ∧ y R z ⇒ x R z, kurz RR ⊆ R."),
    ("Fachbegriff: **transitiver Abschluss**", "**R⁺** = ⋃ₙ≥₁ Rⁿ."),
    ("Fachbegriff: **reflexiv-transitiver Abschluss**", "**R\\*** = Id ∪ R⁺ = ⋃ₙ≥₀ Rⁿ."),
    ("Fachbegriff: **Invariante**", "Eigenschaft, die bei jedem erlaubten Schritt erhalten bleibt."),
    ("Fachbegriff: **Methode des kleinsten Verbrechers**", "Beweis durch Annahme eines kleinsten Gegenbeispiels, aus dem ein noch kleineres konstruiert wird (Widerspruch)."),
    ("Fachbegriff: **Äquivalenzrelation**", "reflexiv + symmetrisch + transitiv."),
    ("Fachbegriff: **Äquivalenzklasse**", "**[a]_R** = {x | x R a}."),
    ("Fachbegriff: **Quotientenmenge**", "**A/R** – Menge aller Äquivalenzklassen."),
    ("Fachbegriff: **Repräsentant / Repräsentantensystem**", "Repräsentant: ein Vertreter einer Klasse. System: genau ein Vertreter je Klasse."),
    ("Fachbegriff: **Kongruenz modulo m**", "**a ≡ b (mod m)** ⇔ m | (a − b) ⇔ gleicher Rest bei Division durch m."),
    ("Fachbegriff: **Restklasse**", "Äquivalenzklasse bezüglich ≡ mod m, z. B. [1] mod 3."),
    ("Fachbegriff: **semantische Äquivalenz**", "Gleiches Ergebnis/Verhalten trotz unterschiedlicher Schreibweise."),
    ("Fachbegriff: **partielle Ordnung (Halbordnung)**", "reflexiv + antisymmetrisch + transitiv."),
    ("Fachbegriff: **Totalordnung (lineare Ordnung)**", "Partielle Ordnung, in der je zwei Elemente vergleichbar sind."),
    ("Fachbegriff: **strikte Ordnung**", "asymmetrisch + transitiv (z. B. <, ⊊)."),
    ("Fachbegriffe: **vergleichbar / unvergleichbar**", "a, b vergleichbar ⇔ a R b oder b R a; sonst unvergleichbar."),
    ("Fachbegriff: **duale Ordnung**", "Die umgekehrte Ordnung Rᵀ (z. B. ≥ zu ≤)."),
    ("Fachbegriff: **Hasse-Diagramm**", "Darstellung einer partiellen Ordnung ohne Schleifen und transitive Kanten; kleinere Elemente unten."),
    ("Fachbegriff: **transitive Kante**", "Kante, die sich bereits aus einem Weg über Zwischenknoten ergibt – im Hasse-Diagramm weggelassen."),
    ("Fachbegriff: **Präfixordnung**", "Partielle Ordnung »u ist Präfix von v« auf Wörtern."),
    ("Fachbegriff: **lexikographische Ordnung**", "Wörterbuchordnung: erstes unterschiedliches Zeichen entscheidet, Präfix vor längerem Wort; total bei totalem Alphabet."),
    ("Fachbegriff: **Teilbarkeitsrelation**", "**a | b** – b ist Vielfaches von a; partielle Ordnung auf ℕ."),
    ("Symbol → Name: **a R b,  Rᵀ,  Id_A,  RS,  Rⁿ**", "a steht in Relation zu b, transponierte Relation, Identität, relationales Produkt, n-te Potenz."),
    ("Symbol → Name: **R⁺  R\\*  [a]_R  A/R  ≡**", "transitiver Abschluss, reflexiv-transitiver Abschluss, Äquivalenzklasse, Quotientenmenge, kongruent."),
    ("Symbol → Name: **π  ▷◁  |w|_I  a | b**", "Projektion, Join, Anzahl der I im Wort w, a teilt b."),
])

# Fachbegriffe im Stapel nach vorn: je Überthema zuerst Begriffe, dann Verständnisfragen
order = [T1, T2, T3, T4, T5]
cards.sort(key=lambda c: (order.index(c[2].split(", ")[0]), 0 if FB in c[2] else 1))

# Sterne der Abschlüsse (R*, Σ*) als Operator-Zeichen, damit der Markdown-Renderer sie nicht als Kursiv liest
import re
def star(x):
    x = x.replace("\\*", "∗")
    return re.sub(r"(?<=[A-Za-zΣ)ᵀ])\*(?!\*)", "∗", x)
cards = [(star(f), star(b), t) for f, b, t in cards]

# CSV schreiben
q = lambda x: '"' + x.replace('"', '""') + '"'
out = ["﻿" + ";".join(map(q, ["Vorderseite", "Rückseite", "Tags"]))]
out += [";".join(map(q, c)) for c in cards]
open(sys.argv[1], "w", encoding="utf-8", newline="").write("\r\n".join(out) + "\r\n")
print(len(cards), "Karten")
