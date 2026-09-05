// Words for kalambury. Bundled rather than fetched: the drawer's client picks
// one locally and only its hash goes on chain, so the list must work offline.
//
// Concrete, drawable nouns only — abstract nouns make for bad rounds. Single
// words, nothing that needs a caption to be recognised, and nothing so obscure
// that a table would argue about it.
//
// Grouped only so the list is easy to extend and to see what is thin; the
// groups carry no meaning at pick time. Three rules the tests enforce: no
// duplicates, no two words that normalise to the same guess ("łoś" and "los"
// would both become "los", and one of them could never be won), and nothing
// longer than the contract's MAX_GUESS_BYTES.
//
// There is no fourth rule, and that is the point: nothing here can check that
// a word is a noun, that it is spelled right, or that a table could draw it in
// two minutes. Padding this list to a round number produced "derka" (a horse
// blanket), "pociągnik" (not a word at all), and adjectives like "psia" and
// "ruchome" lifted out of phrases. Words earn their place by being drawable,
// not by making the count bigger.

const ANIMALS = [
  'żółw', 'słoń', 'żaba', 'pingwin', 'żyrafa', 'kot', 'pies', 'koń', 'krowa', 'świnia',
  'owca', 'kura', 'kaczka', 'gęś', 'ryba', 'rekin', 'wieloryb', 'delfin', 'krab',
  'ośmiornica', 'meduza', 'motyl', 'pszczoła', 'mrówka', 'pająk', 'ślimak', 'biedronka',
  'wąż', 'jaszczurka', 'krokodyl', 'małpa', 'niedźwiedź', 'wilk', 'lis', 'jeż', 'wiewiórka',
  'zając', 'mysz', 'nietoperz', 'sowa', 'orzeł', 'papuga', 'paw', 'struś', 'lew', 'tygrys',
  'zebra', 'hipopotam', 'nosorożec', 'wielbłąd', 'kangur', 'panda', 'jeleń', 'foka', 'kotek',
  'szczeniak', 'źrebak', 'cielak', 'prosiak', 'jagnię', 'kurczak', 'koza', 'baran', 'byk',
  'osioł', 'muł', 'lama', 'alpaka', 'bizon', 'żubr', 'antylopa', 'gazela', 'renifer', 'sarna',
  'dzik', 'borsuk', 'kuna', 'łasica', 'wydra', 'bóbr', 'szop', 'skunks', 'surykatka', 'hiena',
  'szakal', 'gepard', 'jaguar', 'leopard', 'puma', 'ryś', 'żbik', 'goryl', 'szympans',
  'orangutan', 'pawian', 'lemur', 'koala', 'wombat', 'dziobak', 'jeżozwierz', 'pancernik',
  'mrówkojad', 'leniwiec', 'tapir', 'kret', 'ryjówka', 'chomik', 'świnka', 'szczur',
  'szynszyla', 'fretka', 'wróbel', 'gołąb', 'sikorka', 'kos', 'szpak', 'jaskółka',
  'skowronek', 'słowik', 'dzięcioł', 'kukułka', 'sroka', 'wrona', 'kruk', 'gawron', 'czapla',
  'bocian', 'żuraw', 'flaming', 'pelikan', 'łabędź', 'mewa', 'albatros', 'kormoran',
  'zimorodek', 'jastrząb', 'sokół', 'sęp', 'kondor', 'puchacz', 'bażant', 'przepiórka',
  'indyk', 'kogut', 'tukan', 'papużka', 'kanarek', 'karp', 'szczupak', 'okoń', 'sum',
  'węgorz', 'łosoś', 'pstrąg', 'śledź', 'sardynka', 'tuńczyk', 'dorsz', 'flądra', 'murena',
  'rozgwiazda', 'jeżowiec', 'małż', 'ostryga', 'homar', 'krewetka', 'langusta', 'kalmar',
  'koralowiec', 'żmija', 'boa', 'pyton', 'kobra', 'grzechotnik', 'kameleon', 'gekon',
  'legwan', 'waran', 'aligator', 'salamandra', 'ropucha', 'osa', 'szerszeń', 'trzmiel',
  'chrząszcz', 'żuk', 'karaluch', 'świerszcz', 'konik', 'ważka', 'komar', 'mucha', 'bąk',
  'kleszcz', 'skorpion', 'gąsienica', 'modliszka', 'świetlik', 'mamut', 'dinozaur',
  'tyranozaur', 'triceratops', 'stegozaur', 'brontozaur', 'pterodaktyl', 'szkielet'
];

const FOOD = [
  'grzyb', 'truskawka', 'chleb', 'ser', 'jajko', 'mleko', 'masło', 'jabłko', 'gruszka',
  'banan', 'pomarańcza', 'cytryna', 'arbuz', 'winogrono', 'wiśnia', 'śliwka', 'marchewka',
  'ziemniak', 'pomidor', 'ogórek', 'cebula', 'czosnek', 'kapusta', 'dynia', 'kukurydza',
  'orzech', 'ciastko', 'tort', 'lody', 'czekolada', 'pizza', 'kanapka', 'zupa', 'makaron',
  'kiełbasa', 'miód', 'bułka', 'bagietka', 'rogal', 'precel', 'obwarzanek', 'sucharek',
  'grzanka', 'naleśnik', 'racuch', 'gofr', 'pączek', 'drożdżówka', 'sernik', 'szarlotka',
  'babka', 'piernik', 'beza', 'ptyś', 'eklerka', 'muffinka', 'biszkopt', 'wafel', 'lizak',
  'guma', 'cukierek', 'krówka', 'chałwa', 'marcepan', 'galaretka', 'budyń', 'kisiel', 'krem',
  'malina', 'jeżyna', 'borówka', 'porzeczka', 'brzoskwinia', 'morela', 'ananas', 'mango',
  'kiwi', 'granat', 'rodzynka', 'melon', 'mandarynka', 'grejpfrut', 'limonka', 'awokado',
  'kokos', 'burak', 'rzodkiewka', 'pietruszka', 'seler', 'por', 'szpinak', 'brokuł',
  'kalafior', 'brukselka', 'fasola', 'groch', 'bakłażan', 'cukinia', 'papryka', 'chili',
  'oliwka', 'szparag', 'sałata', 'koperek', 'bazylia', 'mięta', 'szczypiorek', 'ryż', 'kasza',
  'mąka', 'płatki', 'chipsy', 'popcorn', 'orzeszki', 'migdał', 'pistacja', 'kasztan',
  'żołądź', 'szynka', 'boczek', 'salami', 'parówka', 'kotlet', 'stek', 'żeberka', 'udko',
  'skrzydełko', 'pasztet', 'kaszanka', 'schab', 'jogurt', 'kefir', 'śmietana', 'twaróg',
  'herbata', 'kawa', 'kakao', 'sok', 'lemoniada', 'kompot', 'woda', 'wino', 'piwo', 'szampan',
  'koktajl', 'smoothie', 'sól', 'pieprz', 'cukier', 'ocet', 'musztarda', 'ketchup', 'majonez',
  'dżem', 'powidła', 'nutella', 'syrop', 'olej', 'oliwa', 'pierogi', 'bigos', 'gołąbki',
  'placki', 'kluski', 'kopytka', 'żurek', 'rosół', 'barszcz', 'flaki', 'zapiekanka', 'frytki',
  'hamburger', 'hotdog', 'kebab', 'sushi', 'taco', 'burrito', 'lasagne', 'spaghetti', 'omlet',
  'jajecznica', 'tosty'
];

const HOUSEHOLD = [
  'parasol', 'zegarek', 'lodówka', 'drabina', 'żarówka', 'walizka', 'miotła', 'nożyce',
  'okulary', 'waga', 'termometr', 'łóżko', 'krzesło', 'stół', 'kanapa', 'szafa', 'lampa',
  'dywan', 'poduszka', 'lustro', 'drzwi', 'okno', 'klucz', 'kłódka', 'świeca', 'latarka',
  'telefon', 'komputer', 'telewizor', 'radio', 'aparat', 'książka', 'gazeta', 'ołówek',
  'długopis', 'pędzel', 'widelec', 'łyżka', 'nóż', 'talerz', 'kubek', 'szklanka', 'butelka',
  'garnek', 'patelnia', 'czajnik', 'koszyk', 'wiadro', 'szczotka', 'grzebień', 'mydło',
  'ręcznik', 'plecak', 'torba', 'portfel', 'moneta', 'parasolka', 'klepsydra', 'wachlarz',
  'globus', 'mapa', 'fotel', 'taboret', 'ława', 'biurko', 'regał', 'półka', 'komoda',
  'kredens', 'wieszak', 'stolik', 'materac', 'kołdra', 'prześcieradło', 'firanka', 'zasłona',
  'roleta', 'żyrandol', 'obraz', 'ramka', 'wazon', 'doniczka', 'świecznik', 'dzbanek',
  'filiżanka', 'miska', 'taca', 'tarka', 'sitko', 'deska', 'wałek', 'blender', 'mikser',
  'toster', 'piekarnik', 'kuchenka', 'zmywarka', 'pralka', 'suszarka', 'żelazko', 'odkurzacz',
  'mop', 'gąbka', 'kosz', 'słoik', 'puszka', 'karton', 'pudełko', 'torebka', 'siatka',
  'kufer', 'skrzynia', 'sejf', 'szuflada', 'zamek', 'klamka', 'zawias', 'dzwonek',
  'szczoteczka', 'pasta', 'szampon', 'balsam', 'perfumy', 'lakier', 'grzebyk', 'lokówka',
  'maszynka', 'brzytwa', 'pęseta', 'cążki', 'pilnik', 'wata', 'plaster', 'bandaż',
  'strzykawka', 'tabletka', 'kołyska', 'wózek', 'grzechotka', 'pielucha', 'budzik',
  'kalendarz', 'notes', 'zeszyt', 'teczka', 'linijka', 'cyrkiel', 'gumka', 'kredka',
  'flamaster', 'marker', 'klej', 'taśma', 'zszywacz', 'spinacz', 'pinezka', 'koperta',
  'znaczek', 'pocztówka', 'list', 'paczka'
];

const TOOLS = [
  'młotek', 'kompas', 'kotwica', 'gwóźdź', 'śruba', 'piła', 'siekiera', 'lina', 'sieć',
  'haczyk', 'lupa', 'mikroskop', 'teleskop', 'lornetka', 'bateria', 'żagiel', 'wędka',
  'wkrętak', 'obcęgi', 'kombinerki', 'imadło', 'wiertarka', 'wiertło', 'szlifierka', 'piłka',
  'dłuto', 'miarka', 'pistolet', 'grabie', 'łopata', 'szpadel', 'widły', 'kosa', 'sierp',
  'konewka', 'taczka', 'kosiarka', 'drut', 'łańcuch', 'sprężyna', 'silnik', 'dźwignia',
  'winda', 'dźwig', 'koparka', 'antena', 'kabel', 'wtyczka', 'gniazdko', 'przełącznik',
  'akumulator', 'ładowarka', 'słuchawki', 'głośnik', 'mikrofon', 'kamera', 'projektor',
  'ekran', 'klawiatura', 'myszka', 'drukarka', 'skaner', 'monitor', 'laptop', 'tablet',
  'pendrive', 'dysk', 'router', 'konsola', 'pilot', 'stoper', 'kalkulator', 'termostat',
  'barometr'
];

const NATURE = [
  'kaktus', 'choinka', 'wulkan', 'drzewo', 'kwiat', 'róża', 'tulipan', 'liść', 'trawa',
  'kamień', 'góra', 'rzeka', 'jezioro', 'morze', 'plaża', 'wyspa', 'las', 'chmura', 'deszcz',
  'śnieg', 'tęcza', 'słońce', 'księżyc', 'gwiazda', 'planeta', 'ogień', 'bałwan', 'sopel',
  'pióro', 'muszla', 'dąb', 'brzoza', 'sosna', 'świerk', 'jodła', 'klon', 'wierzba',
  'kasztanowiec', 'lipa', 'cyprys', 'palma', 'bambus', 'krzak', 'żywopłot', 'pień', 'gałąź',
  'korzeń', 'kora', 'szyszka', 'płatek', 'stokrotka', 'słonecznik', 'mak', 'fiołek',
  'konwalia', 'narcyz', 'bez', 'jaśmin', 'lawenda', 'goździk', 'orchidea', 'lilia', 'piwonia',
  'pokrzywa', 'paproć', 'mech', 'wodorost', 'trzcina', 'wzgórze', 'dolina', 'wąwóz',
  'jaskinia', 'grota', 'skała', 'głaz', 'klif', 'wydma', 'pustynia', 'oaza', 'step', 'łąka',
  'pole', 'bagno', 'staw', 'strumień', 'potok', 'wodospad', 'źródło', 'gejzer', 'lodowiec',
  'przełęcz', 'szczyt', 'zbocze', 'brzeg', 'zatoka', 'półwysep', 'rafa', 'ocean', 'fala',
  'piana', 'burza', 'piorun', 'błyskawica', 'grad', 'mgła', 'szron', 'rosa', 'lód', 'kałuża',
  'lawina', 'trąba', 'huragan', 'zaćmienie', 'kometa', 'meteoryt', 'galaktyka'
];

const VEHICLES = [
  'rower', 'rakieta', 'sanie', 'balon', 'latawiec', 'samochód', 'autobus', 'pociąg',
  'samolot', 'statek', 'łódka', 'helikopter', 'motocykl', 'hulajnoga', 'traktor',
  'ciężarówka', 'karetka', 'tramwaj', 'spadochron', 'rowerek', 'skuter', 'quad', 'gokart',
  'limuzyna', 'taksówka', 'furgonetka', 'kamper', 'przyczepa', 'wywrotka', 'śmieciarka',
  'radiowóz', 'wóz', 'kombajn', 'buldożer', 'spychacz', 'czołg', 'transporter', 'łazik',
  'sanki', 'lokomotywa', 'wagon', 'kolejka', 'metro', 'trolejbus', 'żaglówka', 'jacht',
  'katamaran', 'kajak', 'kanoe', 'ponton', 'tratwa', 'prom', 'okręt', 'łódź', 'wiosło',
  'ster', 'maszt', 'szybowiec', 'awionetka', 'odrzutowiec', 'dron', 'wahadłowiec', 'satelita',
  'karuzela', 'rollercoaster'
];

const PLACES = [
  'latarnia', 'piramida', 'schody', 'igloo', 'wiatrak', 'dom', 'kościół', 'wieża', 'most',
  'szkoła', 'sklep', 'młyn', 'stodoła', 'namiot', 'garaż', 'płot', 'studnia', 'fontanna',
  'pomnik', 'chata', 'willa', 'pałac', 'twierdza', 'mur', 'brama', 'furtka', 'balkon',
  'taras', 'komin', 'dach', 'strych', 'piwnica', 'korytarz', 'przedpokój', 'kuchnia',
  'łazienka', 'sypialnia', 'salon', 'jadalnia', 'gabinet', 'katedra', 'kaplica', 'klasztor',
  'meczet', 'synagoga', 'świątynia', 'cmentarz', 'grobowiec', 'ołtarz', 'dzwonnica', 'ratusz',
  'muzeum', 'biblioteka', 'teatr', 'opera', 'kino', 'cyrk', 'stadion', 'basen', 'siłownia',
  'boisko', 'kort', 'lodowisko', 'skocznia', 'szpital', 'apteka', 'poczta', 'bank',
  'komisariat', 'dworzec', 'lotnisko', 'port', 'przystań', 'stacja', 'peron', 'tunel',
  'wiadukt', 'tama', 'kanał', 'rynek', 'plac', 'ulica', 'chodnik', 'skrzyżowanie', 'rondo',
  'parking', 'przystanek', 'piekarnia', 'cukiernia', 'rzeźnia', 'kawiarnia', 'restauracja',
  'bar', 'karczma', 'hotel', 'motel', 'schronisko', 'kemping', 'zoo', 'akwarium', 'ogród',
  'park', 'szklarnia', 'kurnik', 'obora', 'chlew', 'stajnia', 'kopalnia', 'fabryka',
  'warsztat', 'elektrownia', 'labirynt', 'ruiny'
];

const CLOTHES = [
  'koszula', 'spodnie', 'sukienka', 'kurtka', 'czapka', 'kapelusz', 'szalik', 'rękawiczki',
  'buty', 'skarpetki', 'krawat', 'pasek', 'guzik', 'sweter', 'korona', 'maska', 'bluzka',
  'podkoszulek', 'koszulka', 'golf', 'kamizelka', 'marynarka', 'garnitur', 'płaszcz',
  'kożuch', 'peleryna', 'poncho', 'dres', 'szorty', 'spódnica', 'kombinezon', 'fartuch',
  'piżama', 'szlafrok', 'kąpielówki', 'kostium', 'bikini', 'rajstopy', 'pończochy', 'getry',
  'legginsy', 'trampki', 'tenisówki', 'sandały', 'klapki', 'kalosze', 'kozaki', 'szpilki',
  'kapcie', 'sznurówki', 'beret', 'cylinder', 'sombrero', 'hełm', 'kask', 'turban', 'chusta',
  'opaska', 'kokarda', 'wstążka', 'naszyjnik', 'bransoletka', 'pierścionek', 'kolczyk',
  'broszka', 'spinka', 'rękawica'
];

const MUSIC_AND_SPORT = [
  'harmonijka', 'akordeon', 'gitara', 'skrzypce', 'pianino', 'trąbka', 'bęben', 'flet',
  'harfa', 'nuty', 'narty', 'łyżwy', 'deskorolka', 'huśtawka', 'hantle', 'medal', 'fortepian',
  'organy', 'wiolonczela', 'ukulele', 'klarnet', 'saksofon', 'puzon', 'tuba', 'róg',
  'perkusja', 'tamburyn', 'marakasy', 'kastaniety', 'ksylofon', 'dzwonki', 'trójkąt', 'gong',
  'smyczek', 'struna', 'klawisz', 'pedał', 'wzmacniacz', 'gramofon', 'płyta', 'kaseta',
  'lotka', 'kij', 'kijek', 'krążek', 'bramka', 'obręcz', 'siodełko', 'kierownica', 'sztanga',
  'ciężarek', 'skakanka', 'trampolina', 'drążek', 'kółka', 'mata', 'rękawice', 'ochraniacz',
  'gwizdek', 'puchar', 'trofeum', 'wieniec', 'podium', 'sędzia', 'trener', 'oszczep', 'młot',
  'kula', 'tyczka', 'łuk', 'strzała', 'tarcza', 'szpada', 'floret', 'szabla'
];

const PEOPLE = [
  'król', 'królowa', 'rycerz', 'pirat', 'klaun', 'czarownica', 'duch', 'robot', 'kosmita',
  'anioł', 'mumia', 'wampir', 'syrena', 'smok', 'jednorożec', 'strach', 'żołnierz', 'nurek',
  'kucharz', 'książę', 'księżniczka', 'cesarz', 'błazen', 'mnich', 'ksiądz', 'zakonnica',
  'biskup', 'papież', 'szaman', 'wróżka', 'czarodziej', 'mag', 'wiedźma', 'olbrzym',
  'krasnal', 'skrzat', 'elf', 'goblin', 'troll', 'ogr', 'centaur', 'minotaur', 'cyklop',
  'wilkołak', 'zombi', 'demon', 'diabeł', 'strażak', 'policjant', 'lekarz', 'pielęgniarka',
  'dentysta', 'weterynarz', 'nauczyciel', 'uczeń', 'student', 'profesor', 'naukowiec',
  'astronauta', 'stewardesa', 'kierowca', 'marynarz', 'kapitan', 'rybak', 'myśliwy', 'rolnik',
  'ogrodnik', 'pasterz', 'drwal', 'górnik', 'murarz', 'stolarz', 'kowal', 'szewc', 'krawiec',
  'fryzjer', 'piekarz', 'rzeźnik', 'kelner', 'barman', 'sprzedawca', 'listonosz', 'kominiarz',
  'mechanik', 'elektryk', 'hydraulik', 'malarz', 'fotograf', 'dziennikarz', 'pisarz', 'poeta',
  'aktor', 'tancerz', 'śpiewak', 'muzyk', 'akrobata', 'żongler', 'magik', 'adwokat',
  'złodziej', 'detektyw', 'szpieg', 'strażnik', 'żeglarz', 'alpinista', 'narciarz', 'pływak',
  'biegacz', 'kolarz', 'bokser', 'łucznik', 'jeździec', 'kowboj', 'szeryf', 'wiking',
  'gladiator', 'samuraj', 'ninja', 'faraon', 'jaskiniowiec', 'niemowlę', 'dziecko',
  'chłopiec', 'dziewczynka', 'babcia', 'dziadek', 'mama', 'tata', 'brat', 'siostra'
];

const BODY = [
  'oko', 'ucho', 'nos', 'serce', 'ząb', 'broda', 'wąsy', 'dłoń', 'stopa', 'głowa', 'twarz',
  'czoło', 'policzek', 'usta', 'język', 'gardło', 'szyja', 'ramię', 'łokieć', 'palec',
  'kciuk', 'paznokieć', 'pięść', 'pierś', 'brzuch', 'plecy', 'biodro', 'udo', 'kolano',
  'kostka', 'pięta', 'czaszka', 'mózg', 'płuco', 'żołądek', 'kość', 'skóra', 'włos', 'brew',
  'rzęsa', 'warkocz', 'peruka', 'blizna'
];

const TOYS_AND_GAMES = [
  'lalka', 'miś', 'pluszak', 'klocki', 'układanka', 'puzzle', 'piłeczka', 'kulka',
  'samochodzik', 'domek', 'łopatka', 'kredki', 'malowanka', 'plastelina', 'origami',
  'wiatraczek', 'bańka', 'rolki', 'wrotki', 'karty', 'szachy', 'warcaby', 'domino',
  'krzyżówka', 'bumerang', 'frisbee', 'petarda', 'fajerwerk', 'konfetti', 'serpentyna',
  'balonik', 'prezent', 'świeczka'
];

const SYMBOLS = [
  'gwiazdka', 'strzałka', 'krzyż', 'koło', 'kwadrat', 'prostokąt', 'spirala', 'zygzak',
  'nuta', 'płomień', 'śnieżynka', 'podkowa', 'flaga', 'bukiet', 'zegar', 'bomba', 'dynamit'
];

const MISC = [
  'miecz', 'armata', 'skarb', 'trumna', 'diament', 'perła', 'klejnot', 'pierścień',
  'kryształ', 'zbroja', 'topór', 'włócznia', 'beczka', 'dzban', 'pochodnia', 'ognisko',
  'kominek', 'sito', 'igła', 'nitka', 'nożyczki', 'szpilka'
];

const MORE = [
  'wentylator', 'sznur', 'zjeżdżalnia', 'piaskownica', 'kolumna', 'filar', 'posąg'
];

const LAST = [
  'ambulans', 'dorożka', 'hamak', 'karabin', 'lampion'
];

export const WORDS = [
  ...ANIMALS,
  ...FOOD,
  ...HOUSEHOLD,
  ...TOOLS,
  ...NATURE,
  ...VEHICLES,
  ...PLACES,
  ...CLOTHES,
  ...MUSIC_AND_SPORT,
  ...PEOPLE,
  ...BODY,
  ...TOYS_AND_GAMES,
  ...SYMBOLS,
  ...MISC,
  ...MORE,
  ...LAST,
];

/// A word this drawer has not had yet, falling back to the whole list once
/// they have had them all.
export function pickWord(used = [], random = Math.random) {
  const remaining = WORDS.filter((word) => !used.includes(word));
  const pool = remaining.length > 0 ? remaining : WORDS;
  return pool[Math.floor(random() * pool.length)];
}
