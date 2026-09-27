// Real recipes, kept verbatim as regression fixtures.
//
// These are the ones that actually found bugs: the first exposed the title
// being rendered twice, the second exposed a range in the method scaling only
// its second half ("50-80 g" → "50-160 g") and fractions being rewritten as
// decimals at ×1. Invented examples had missed both.
//
// Treat the text as data: adjust it only to reflect a real change to the
// recipes, never to make a failing test pass.

export const GOFRY = {
  name: 'Gofry orkiszowe',
  ingredients: [
    '200 g mąki orkiszowej 1700',
    '2 jajka (białka ubić osobno na pianę)',
    '300 ml mleka (lub kefiru)',
    '25 g oliwy',
    '20 g cukru (lub łyżka miodu)',
    '1 łyżeczka proszku do pieczenia',
    'szczypta soli',
  ].join('\n'),
  md: `# Gofry orkiszowe

## Metoda

1. Oddziel białka od żółtek i ubij białka na sztywną pianę.
2. Wymieszaj żółtka z mlekiem, oliwą i cukrem.
3. Dodaj mąkę, proszek i sól, wymieszaj.
4. Na końcu delikatnie wmieszaj pianę.
5. Piecz w gofrownicy.

## Uwagi

- Jak ciasto za gęste, dolej trochę mleka.
- Jak używasz kefiru, dorzuć szczyptę sody oczyszczonej dla puszystości.`,
};

export const CIASTECZKA = {
  name: 'Ciasteczka owsiane',
  ingredients: [
    '450 g mąki orkiszowej 1700',
    '200 g płatków owsianych (zmiel ~połowę)',
    '100 g mielonych migdałów',
    '70 g oliwy',
    '80 g cukru',
    '180-190 ml mleka',
    '2 łyżeczki proszku do pieczenia',
    '1/4 łyżeczki soli',
    'wanilia (opcjonalnie)',
  ].join('\n'),
  md: `# Ciasteczka owsiane

oliwa + migdały + cukier

## Metoda

1. Wymieszaj suche składniki (mąka, płatki, migdały, cukier, proszek, sól).
2. Dodaj oliwę i wanilię.
3. Dolewaj mleko po trochu, aż ciasto się zwiąże (ma się dać uformować, nie kruszyć).
4. Schłodź 30 min w lodówce.
5. Wałkuj na 4-6 mm między dwoma arkuszami papieru, wycinaj kształty.
6. Piecz ~15 min w 180-190°C do złocenia.
7. Studź na kratce.

## Uwagi

- Jak ciasto kruche/nie lepi, dodaj więcej mleka (nie oliwy).
- Jak dodajesz gorzką czekoladę, wmieszaj 50-80 g posiekanej na końcu.`,
};

export const CYNAMONKI = {
  name: 'Bardzo puchate cynamonki',
  servings: 6,
  ingredients: [
    '240 ml mleka pełnotłustego lub roślinnego (ciasto)',
    '360 g mąki pszennej typ 550 (ciasto)',
    '1 żółtko z dużego jajka (ciasto)',
    '7 g drożdży instant (ciasto)',
    '3 łyżki drobnego cukru (ciasto)',
    '1/4 łyżeczki soli morskiej (ciasto)',
    '100 g masła w temperaturze pokojowej (ciasto)',
    '100 g masła (nadzienie)',
    '2 łyżki cynamonu (nadzienie)',
    '100 g cukru trzcinowego (nadzienie)',
    '1/4 łyżeczki soli morskiej (nadzienie)',
    '1 jajko (glazura)',
    '1 łyżka mleka (glazura)',
    '1 mała pomarańcza (krem)',
    '250 g mascarpone (krem)',
    '2 łyżki miodu (krem)',
    '1/4 łyżeczki soli morskiej (krem)',
  ].join('\n'),
  md: `# Bardzo puchate cynamonki

## Metoda

1. W średnim rondlu wymieszaj 180 ml mleka i 30 g mąki pszennej. Zagotuj, cały czas mieszając rózgą, aby pozbyć się grudek. Od razu po zagotowaniu zdejmij z ognia. To japońska zasmażka tangzhong, dzięki której cynamonki będą bardziej puszyste. Odstaw do wystygnięcia, na około 15 minut. Wlej pozostałe 60 ml mleka, dodaj {1} żółtko i wymieszaj.
2. W misce miksera połącz pozostałe 330 g mąki pszennej, 7 g drożdży instant, 3 łyżki cukru i 1/4 łyżeczki soli. Dodaj zasmażkę tangzhong i wymieszaj łyżką do połączenia. Wyrabiaj na małej mocy, aż ciasto będzie bardzo elastyczne i nie będzie rwało się po rozciągnięciu, około 10 minut. Kontynuując wyrabianie, zacznij dodawać 100 g masła, łyżeczka po łyżeczce, aż ciasto całkowicie je wchłonie, 7 – 8 minut. Przykryj ściereczką i odstaw do podwojenia objętości, na około 60 minut.
3. W międzyczasie przygotuj nadzienie: roztop 100 g masła na patelni na umiarkowanej mocy. Gotuj je, aż stanie się bursztynowe i nabierze orzechowego zapachu, 6 – 8 minut. Zdejmij z ognia, dodaj 2 łyżki cynamonu, a następnie 100 g cukru trzcinowego. Dokładnie wymieszaj i dopraw 1/4 łyżeczki soli. Odstaw do wystygnięcia — po tym czasie farsz uzyska idealną konsystencję.
4. Wyłóż ciasto na blat oprószony mąką. Rozwałkuj je na prostokąt 25 x 35 cm. Wyłóż krem cynamonowy, pozostawiając około 1 cm od brzegów. Zaczynając od krótszego brzegu, zroluj ciasto jak najciaśniej. Odetnij krańce, a resztę rulonu pokrój na 6 równych kawałków. Przełóż je do tortownicy 23 cm wyłożonej papierem, spiralkami ku górze — jedno w środku i 5 dookoła.
5. Posmaruj cynamonki glazurą z {1} jajka roztrzepanego z 1 łyżką mleka. Przykryj ręcznikiem i odstaw na 30 minut do wyrośnięcia.
6. Rozgrzej piekarnik do 180°C (góra-dół). Posmaruj cynamonki raz jeszcze glazurą. Piecz, aż będą wyrośnięte i przyrumienione na złoty kolor, 25 – 30 minut.
7. W międzyczasie z {1} pomarańczy zetrzyj 2 łyżeczki skórki i wyciśnij 2 łyżki soku. Wymieszaj 250 g mascarpone z sokiem, 1 łyżeczką startej skórki, 2 łyżkami miodu i 1/4 łyżeczki soli.
8. Po 5 – 10 minutach od wyjęcia z pieca posmaruj cynamonki kremem pomarańczowym — chcesz, aby lekko się rozpuścił. Ozdób pozostałą łyżeczką skórki.

## Rady

- Drożdże suszone można zastąpić świeżymi w ilości 20 g.
- Skalowanie zmienia składniki i ilości w krokach, ale nie formę: przy podwojeniu potrzebne są dwie tortownice 23 cm.
- Liczby w klamrach, jak \`{1}\`, to wymuszone skalowanie — sama cyfra bez jednostki nie skaluje się sama.`,
};

export const ALL = [GOFRY, CIASTECZKA, CYNAMONKI];

/// Text that must survive every scale factor untouched. Getting any of these
/// wrong ruins the dish or the equipment, which is why the body rule is an
/// allow-list rather than a blocklist.
export const MUST_NOT_CHANGE = [
  'mąki orkiszowej 1700', // flour type, not an amount
  'Schłodź 30 min', // time
  '4-6 mm', // rolling thickness
  '~15 min', // time
  '180-190°C', // oven temperature
  '25 x 35 cm', // rolled dough
  'tortownicy 23 cm', // tin
  '25 – 30 minut', // time
  '180°C', // oven temperature
];
