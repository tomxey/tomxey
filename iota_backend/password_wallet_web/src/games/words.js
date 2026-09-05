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

const ANIMALS = [
  'żółw', 'słoń', 'żaba', 'pingwin', 'żyrafa', 'kot', 'pies', 'koń', 'krowa', 'świnia',
  'owca', 'kura', 'kaczka', 'gęś', 'ryba', 'rekin', 'wieloryb', 'delfin', 'krab',
  'ośmiornica', 'meduza', 'motyl', 'pszczoła', 'mrówka', 'pająk', 'ślimak', 'biedronka',
  'wąż', 'jaszczurka', 'krokodyl', 'małpa', 'niedźwiedź', 'wilk', 'lis', 'jeż', 'wiewiórka',
  'zając', 'mysz', 'nietoperz', 'sowa', 'orzeł', 'papuga', 'paw', 'struś', 'lew', 'tygrys',
  'zebra', 'hipopotam', 'nosorożec', 'wielbłąd', 'kangur', 'panda', 'jeleń', 'foka', 'kotek',
  'szczeniak', 'źrebak', 'cielak', 'prosiak', 'jagnię', 'kurczak', 'koza', 'baran', 'byk',
  'osioł', 'muł', 'lama', 'alpaka', 'bizon', 'żubr', 'antylopa', 'gazela', 'impala',
  'renifer', 'sarna', 'dzik', 'borsuk', 'kuna', 'łasica', 'wydra', 'bóbr', 'szop', 'skunks',
  'oposum', 'surykatka', 'hiena', 'szakal', 'gepard', 'jaguar', 'leopard', 'puma', 'ryś',
  'żbik', 'goryl', 'szympans', 'orangutan', 'pawian', 'lemur', 'koala', 'wombat', 'dziobak',
  'jeżozwierz', 'pancernik', 'mrówkojad', 'leniwiec', 'tapir', 'kret', 'ryjówka', 'chomik',
  'świnka', 'szczur', 'wiewiór', 'suseł', 'bobak', 'szynszyla', 'fretka', 'wróbel', 'gołąb',
  'sikorka', 'kos', 'szpak', 'jaskółka', 'skowronek', 'słowik', 'dzięcioł', 'kukułka',
  'sroka', 'wrona', 'kruk', 'gawron', 'czapla', 'bocian', 'żuraw', 'flaming', 'pelikan',
  'łabędź', 'mewa', 'albatros', 'kormoran', 'perkoz', 'zimorodek', 'jastrząb', 'sokół', 'sęp',
  'kondor', 'puchacz', 'bażant', 'przepiórka', 'indyk', 'kogut', 'tukan', 'kolibry',
  'papużka', 'kanarek', 'gil', 'czyż', 'karp', 'szczupak', 'okoń', 'sum', 'węgorz', 'łosoś',
  'pstrąg', 'śledź', 'sardynka', 'tuńczyk', 'dorsz', 'flądra', 'płotka', 'lin', 'sandacz',
  'murena', 'skalar', 'gupik', 'rozgwiazda', 'jeżowiec', 'małż', 'ostryga', 'przegrzebek',
  'homar', 'krewetka', 'langusta', 'kalmar', 'mątwa', 'koralowiec', 'żółwik', 'żmija',
  'zaskroniec', 'boa', 'pyton', 'kobra', 'grzechotnik', 'kameleon', 'gekon', 'legwan',
  'waran', 'aligator', 'traszka', 'salamandra', 'ropucha', 'kijanka', 'osa', 'szerszeń',
  'trzmiel', 'chrząszcz', 'żuk', 'karaluch', 'świerszcz', 'konik', 'ważka', 'jętka', 'komar',
  'mucha', 'bąk', 'kleszcz', 'skorpion', 'stonoga', 'gąsienica', 'poczwarka', 'termit',
  'cykada', 'modliszka', 'patyczak', 'świetlik', 'pchła', 'wesz', 'dżdżownica', 'pijawka',
  'mamut', 'dinozaur', 'tyranozaur', 'triceratops', 'stegozaur', 'brontozaur', 'pterodaktyl',
  'szkielet'
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
  'malina', 'jeżyna', 'borówka', 'porzeczka', 'agrest', 'żurawina', 'poziomka', 'brzoskwinia',
  'morela', 'nektarynka', 'ananas', 'mango', 'kiwi', 'granat', 'figa', 'daktyl', 'rodzynka',
  'melon', 'mandarynka', 'grejpfrut', 'limonka', 'awokado', 'kokos', 'papaja', 'burak',
  'rzodkiewka', 'pietruszka', 'seler', 'por', 'szpinak', 'brokuł', 'kalafior', 'brukselka',
  'fasola', 'groch', 'soczewica', 'bakłażan', 'cukinia', 'papryka', 'chili', 'oliwka',
  'kapar', 'szparag', 'karczoch', 'rzepa', 'kalarepa', 'sałata', 'rukola', 'koperek',
  'bazylia', 'mięta', 'szczypiorek', 'ryż', 'kasza', 'mąka', 'otręby', 'płatki', 'musli',
  'chipsy', 'popcorn', 'orzeszki', 'migdał', 'pistacja', 'kasztan', 'żołądź', 'szynka',
  'boczek', 'salami', 'parówka', 'kotlet', 'stek', 'żeberka', 'udko', 'skrzydełko', 'pasztet',
  'kaszanka', 'schab', 'jogurt', 'kefir', 'śmietana', 'twaróg', 'oscypek', 'mozzarella',
  'parmezan', 'margaryna', 'smalec', 'herbata', 'kawa', 'kakao', 'sok', 'lemoniada', 'kompot',
  'woda', 'wino', 'piwo', 'szampan', 'koktajl', 'smoothie', 'sól', 'pieprz', 'cukier', 'ocet',
  'musztarda', 'ketchup', 'majonez', 'dżem', 'powidła', 'nutella', 'syrop', 'olej', 'oliwa',
  'pierogi', 'bigos', 'gołąbki', 'placki', 'kluski', 'kopytka', 'żurek', 'rosół', 'barszcz',
  'flaki', 'zapiekanka', 'frytki', 'hamburger', 'hotdog', 'kebab', 'sushi', 'taco', 'burrito',
  'lasagne', 'spaghetti', 'omlet', 'jajecznica', 'sadzone', 'tosty'
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
  'roleta', 'żyrandol', 'kinkiet', 'abażur', 'obraz', 'ramka', 'wazon', 'doniczka',
  'świecznik', 'popielniczka', 'dzbanek', 'imbryk', 'filiżanka', 'spodek', 'miska',
  'salaterka', 'półmisek', 'taca', 'chochla', 'trzepaczka', 'tarka', 'sitko', 'durszlak',
  'deska', 'wałek', 'foremka', 'blender', 'mikser', 'toster', 'piekarnik', 'kuchenka',
  'zmywarka', 'pralka', 'suszarka', 'żelazko', 'odkurzacz', 'mop', 'szufelka', 'ścierka',
  'gąbka', 'kosz', 'słoik', 'puszka', 'karton', 'pudełko', 'torebka', 'reklamówka', 'siatka',
  'walizeczka', 'kufer', 'skrzynia', 'sejf', 'szuflada', 'zamek', 'klamka', 'zawias',
  'dzwonek', 'domofon', 'wycieraczka', 'szczoteczka', 'pasta', 'szampon', 'balsam', 'perfumy',
  'lakier', 'grzebyk', 'lokówka', 'maszynka', 'brzytwa', 'pęseta', 'cążki', 'pilnik', 'wata',
  'plaster', 'bandaż', 'strzykawka', 'tabletka', 'syropek', 'termofor', 'kołyska', 'wózek',
  'smoczek', 'grzechotka', 'pielucha', 'nocnik', 'budzik', 'kalendarz', 'notes', 'zeszyt',
  'segregator', 'teczka', 'linijka', 'ekierka', 'cyrkiel', 'temperówka', 'gumka', 'kredka',
  'flamaster', 'zakreślacz', 'marker', 'kalka', 'klej', 'taśma', 'zszywacz', 'spinacz',
  'pinezka', 'koperta', 'znaczek', 'pocztówka', 'list', 'paczka'
];

const TOOLS = [
  'młotek', 'kompas', 'kotwica', 'gwóźdź', 'śruba', 'piła', 'siekiera', 'lina', 'sieć',
  'haczyk', 'lupa', 'mikroskop', 'teleskop', 'lornetka', 'bateria', 'żagiel', 'wędka',
  'wkrętak', 'obcęgi', 'kombinerki', 'imadło', 'wiertarka', 'wiertło', 'szlifierka', 'piłka',
  'dłuto', 'strug', 'hebel', 'poziomica', 'miarka', 'taśmomierz', 'kielnia', 'packa',
  'szpachla', 'pistolet', 'grabie', 'łopata', 'szpadel', 'motyka', 'widły', 'sekator', 'kosa',
  'sierp', 'konewka', 'taczka', 'kosiarka', 'drut', 'łańcuch', 'sprężyna', 'nakrętka',
  'podkładka', 'nit', 'zawleczka', 'silnik', 'przekładnia', 'tłok', 'korba', 'dźwignia',
  'bloczek', 'winda', 'dźwig', 'koparka', 'walec', 'betoniarka', 'rusztowanie', 'antena',
  'kabel', 'wtyczka', 'gniazdko', 'przełącznik', 'akumulator', 'ładowarka', 'słuchawki',
  'głośnik', 'mikrofon', 'kamera', 'projektor', 'ekran', 'klawiatura', 'myszka', 'drukarka',
  'skaner', 'monitor', 'laptop', 'tablet', 'pendrive', 'dysk', 'router', 'konsola', 'pilot',
  'stoper', 'kalkulator', 'termostat', 'barometr'
];

const NATURE = [
  'kaktus', 'choinka', 'wulkan', 'drzewo', 'kwiat', 'róża', 'tulipan', 'liść', 'trawa',
  'kamień', 'góra', 'rzeka', 'jezioro', 'morze', 'plaża', 'wyspa', 'las', 'chmura', 'deszcz',
  'śnieg', 'tęcza', 'słońce', 'księżyc', 'gwiazda', 'planeta', 'ogień', 'bałwan', 'sopel',
  'pióro', 'muszla', 'dąb', 'brzoza', 'sosna', 'świerk', 'jodła', 'klon', 'topola', 'wierzba',
  'buk', 'jesion', 'kasztanowiec', 'lipa', 'olcha', 'modrzew', 'cyprys', 'palma', 'bambus',
  'krzak', 'żywopłot', 'pień', 'gałąź', 'korzeń', 'kora', 'szyszka', 'nasiono', 'sadzonka',
  'pąk', 'płatek', 'łodyga', 'cierń', 'stokrotka', 'słonecznik', 'mak', 'chaber', 'fiołek',
  'konwalia', 'narcyz', 'żonkil', 'krokus', 'bez', 'jaśmin', 'lawenda', 'goździk', 'orchidea',
  'lilia', 'piwonia', 'dalia', 'astry', 'bratek', 'pokrzywa', 'mniszek', 'paproć', 'mech',
  'porost', 'glon', 'wodorost', 'trzcina', 'sitowie', 'wzgórze', 'dolina', 'wąwóz',
  'jaskinia', 'grota', 'skała', 'głaz', 'klif', 'wydma', 'pustynia', 'oaza', 'step', 'łąka',
  'pole', 'bagno', 'moczary', 'staw', 'strumień', 'potok', 'wodospad', 'źródło', 'gejzer',
  'lodowiec', 'przełęcz', 'szczyt', 'zbocze', 'brzeg', 'zatoka', 'półwysep', 'archipelag',
  'rafa', 'laguna', 'ocean', 'fala', 'piana', 'burza', 'piorun', 'błyskawica', 'grad', 'mgła',
  'szron', 'rosa', 'lód', 'kałuża', 'zaspa', 'lawina', 'trąba', 'huragan', 'susza', 'powódź',
  'wschód', 'zachód', 'zmierzch', 'świt', 'zaćmienie', 'kometa', 'meteoryt', 'galaktyka',
  'orbita', 'kosmos'
];

const VEHICLES = [
  'rower', 'rakieta', 'sanie', 'balon', 'latawiec', 'samochód', 'autobus', 'pociąg',
  'samolot', 'statek', 'łódka', 'helikopter', 'motocykl', 'hulajnoga', 'traktor',
  'ciężarówka', 'karetka', 'tramwaj', 'spadochron', 'rowerek', 'trójkołowiec', 'skuter',
  'quad', 'gokart', 'limuzyna', 'taksówka', 'furgonetka', 'kamper', 'przyczepa', 'naczepa',
  'cysterna', 'wywrotka', 'śmieciarka', 'polewaczka', 'radiowóz', 'wóz', 'kombajn',
  'buldożer', 'spychacz', 'czołg', 'transporter', 'łazik', 'sanki', 'bobslej', 'lokomotywa',
  'wagon', 'drezyna', 'kolejka', 'metro', 'trolejbus', 'żaglówka', 'jacht', 'katamaran',
  'kajak', 'kanoe', 'ponton', 'tratwa', 'prom', 'barka', 'holownik', 'kuter', 'trawler',
  'okręt', 'fregata', 'galeon', 'łódź', 'gondola', 'wiosło', 'ster', 'maszt', 'boja',
  'szybowiec', 'awionetka', 'odrzutowiec', 'dwupłatowiec', 'sterowiec', 'dron', 'wahadłowiec',
  'lądownik', 'satelita', 'kapsuła', 'ruchome', 'wyciąg', 'karuzela', 'rollercoaster'
];

const PLACES = [
  'latarnia', 'piramida', 'schody', 'igloo', 'wiatrak', 'dom', 'kościół', 'wieża', 'most',
  'szkoła', 'sklep', 'młyn', 'stodoła', 'namiot', 'garaż', 'płot', 'studnia', 'fontanna',
  'pomnik', 'chata', 'chałupa', 'willa', 'pałac', 'twierdza', 'forteca', 'baszta', 'mur',
  'brama', 'furtka', 'ganek', 'weranda', 'balkon', 'taras', 'komin', 'dach', 'strych',
  'piwnica', 'korytarz', 'przedpokój', 'kuchnia', 'łazienka', 'sypialnia', 'salon',
  'jadalnia', 'gabinet', 'spiżarnia', 'poddasze', 'katedra', 'kaplica', 'klasztor', 'meczet',
  'synagoga', 'świątynia', 'cmentarz', 'grobowiec', 'krypta', 'ołtarz', 'ambona', 'dzwonnica',
  'ratusz', 'muzeum', 'biblioteka', 'teatr', 'opera', 'kino', 'cyrk', 'stadion', 'basen',
  'siłownia', 'boisko', 'kort', 'lodowisko', 'skocznia', 'szpital', 'apteka', 'poczta',
  'bank', 'komisariat', 'remiza', 'dworzec', 'lotnisko', 'port', 'przystań', 'stacja',
  'peron', 'tunel', 'wiadukt', 'akwedukt', 'tama', 'śluza', 'kanał', 'rynek', 'plac', 'ulica',
  'chodnik', 'skrzyżowanie', 'rondo', 'parking', 'przystanek', 'piekarnia', 'cukiernia',
  'rzeźnia', 'kawiarnia', 'restauracja', 'bar', 'karczma', 'hotel', 'motel', 'schronisko',
  'kemping', 'zoo', 'akwarium', 'ogród', 'park', 'skwer', 'szklarnia', 'pasieka', 'kurnik',
  'obora', 'chlew', 'stajnia', 'psia', 'gołębnik', 'silos', 'spichlerz', 'kopalnia', 'huta',
  'fabryka', 'warsztat', 'tartak', 'cegielnia', 'elektrownia', 'labirynt', 'ruiny'
];

const CLOTHES = [
  'koszula', 'spodnie', 'sukienka', 'kurtka', 'czapka', 'kapelusz', 'szalik', 'rękawiczki',
  'buty', 'skarpetki', 'krawat', 'pasek', 'guzik', 'sweter', 'korona', 'maska', 'bluzka',
  'podkoszulek', 'koszulka', 'golf', 'kamizelka', 'marynarka', 'garnitur', 'płaszcz',
  'kożuch', 'peleryna', 'poncho', 'dres', 'szorty', 'spódnica', 'kombinezon', 'fartuch',
  'piżama', 'szlafrok', 'kąpielówki', 'kostium', 'bikini', 'rajstopy', 'pończochy', 'getry',
  'legginsy', 'trampki', 'tenisówki', 'sandały', 'klapki', 'kalosze', 'kozaki', 'szpilki',
  'baleriny', 'mokasyny', 'trzewiki', 'łapcie', 'kapcie', 'sznurówki', 'beret', 'kaszkiet',
  'cylinder', 'sombrero', 'hełm', 'kask', 'turban', 'chusta', 'apaszka', 'kominiarka',
  'opaska', 'kokarda', 'wstążka', 'naszyjnik', 'bransoletka', 'pierścionek', 'kolczyk',
  'broszka', 'spinka', 'monokl', 'rękawica', 'mufka', 'plecaczek', 'nerka', 'garderoba'
];

const MUSIC_AND_SPORT = [
  'harmonijka', 'akordeon', 'gitara', 'skrzypce', 'pianino', 'trąbka', 'bęben', 'flet',
  'harfa', 'nuty', 'narty', 'łyżwy', 'deskorolka', 'huśtawka', 'hantle', 'medal', 'fortepian',
  'organy', 'klawesyn', 'wiolonczela', 'kontrabas', 'altówka', 'banjo', 'ukulele',
  'mandolina', 'lutnia', 'cytra', 'klarnet', 'obój', 'fagot', 'saksofon', 'puzon', 'tuba',
  'waltornia', 'róg', 'kornet', 'perkusja', 'talerze', 'kotły', 'tamburyn', 'marakasy',
  'kastaniety', 'ksylofon', 'dzwonki', 'trójkąt', 'gong', 'metronom', 'pulpit', 'smyczek',
  'struna', 'klawisz', 'pedał', 'wzmacniacz', 'gramofon', 'płyta', 'kaseta', 'lotka', 'kij',
  'kijek', 'krążek', 'bramka', 'obręcz', 'siodełko', 'kierownica', 'sztanga', 'ciężarek',
  'skakanka', 'trampolina', 'równoważnia', 'drążek', 'kółka', 'kozioł', 'odskocznia', 'mata',
  'rękawice', 'ochraniacz', 'gwizdek', 'puchar', 'trofeum', 'dyplom', 'wieniec', 'podium',
  'trybuna', 'kibic', 'sędzia', 'trener', 'chorągiewka', 'meta', 'start', 'tor', 'przeszkoda',
  'płotek', 'oszczep', 'młot', 'kula', 'tyczka', 'łuk', 'strzała', 'tarcza', 'szpada',
  'floret', 'szabla', 'linka'
];

const PEOPLE = [
  'król', 'królowa', 'rycerz', 'pirat', 'klaun', 'czarownica', 'duch', 'robot', 'kosmita',
  'anioł', 'mumia', 'wampir', 'syrena', 'smok', 'jednorożec', 'strach', 'żołnierz', 'nurek',
  'kucharz', 'książę', 'księżniczka', 'cesarz', 'giermek', 'błazen', 'bard', 'mnich',
  'ksiądz', 'zakonnica', 'biskup', 'papież', 'szaman', 'wróżka', 'czarodziej', 'mag',
  'wiedźma', 'olbrzym', 'krasnal', 'skrzat', 'elf', 'goblin', 'troll', 'ogr', 'centaur',
  'minotaur', 'cyklop', 'wilkołak', 'zombi', 'demon', 'diabeł', 'cherubin', 'bogini', 'nimfa',
  'faun', 'satyr', 'strażak', 'policjant', 'lekarz', 'pielęgniarka', 'dentysta', 'weterynarz',
  'nauczyciel', 'uczeń', 'student', 'profesor', 'naukowiec', 'astronauta', 'stewardesa',
  'kierowca', 'maszynista', 'marynarz', 'kapitan', 'rybak', 'myśliwy', 'rolnik', 'ogrodnik',
  'pasterz', 'drwal', 'górnik', 'murarz', 'cieśla', 'stolarz', 'kowal', 'szewc', 'krawiec',
  'fryzjer', 'piekarz', 'rzeźnik', 'kelner', 'barman', 'sprzedawca', 'listonosz', 'kominiarz',
  'mechanik', 'elektryk', 'hydraulik', 'malarz', 'rzeźbiarz', 'fotograf', 'dziennikarz',
  'pisarz', 'poeta', 'aktor', 'reżyser', 'tancerz', 'śpiewak', 'muzyk', 'dyrygent',
  'akrobata', 'żongler', 'magik', 'linoskoczek', 'treser', 'adwokat', 'złodziej', 'detektyw',
  'szpieg', 'strażnik', 'żeglarz', 'alpinista', 'narciarz', 'pływak', 'biegacz', 'kolarz',
  'bokser', 'zapaśnik', 'szermierz', 'łucznik', 'jeździec', 'kowboj', 'szeryf', 'indianin',
  'wiking', 'gladiator', 'samuraj', 'ninja', 'faraon', 'jaskiniowiec', 'niemowlę', 'dziecko',
  'chłopiec', 'dziewczynka', 'babcia', 'dziadek', 'mama', 'tata', 'brat', 'siostra',
  'bliźniaki', 'rodzina', 'para'
];

const BODY = [
  'oko', 'ucho', 'nos', 'serce', 'ząb', 'broda', 'wąsy', 'dłoń', 'stopa', 'głowa', 'twarz',
  'czoło', 'policzek', 'podbródek', 'usta', 'warga', 'język', 'gardło', 'szyja', 'kark',
  'ramię', 'łokieć', 'nadgarstek', 'palec', 'kciuk', 'paznokieć', 'pięść', 'pierś', 'brzuch',
  'plecy', 'biodro', 'udo', 'kolano', 'łydka', 'kostka', 'pięta', 'żebro', 'kręgosłup',
  'czaszka', 'mózg', 'płuco', 'wątroba', 'żołądek', 'jelito', 'kość', 'mięsień', 'żyła',
  'skóra', 'włos', 'brew', 'rzęsa', 'źrenica', 'grzywka', 'warkocz', 'kok', 'lok', 'peruka',
  'blizna', 'pieg', 'dołek'
];

const TOYS_AND_GAMES = [
  'lalka', 'miś', 'pluszak', 'klocki', 'układanka', 'puzzle', 'bączek', 'jojo', 'bąbel',
  'piłeczka', 'kulka', 'marmurek', 'samochodzik', 'pociągnik', 'domek', 'wiaderko', 'łopatka',
  'kredki', 'malowanka', 'plastelina', 'modelina', 'origami', 'wiatraczek', 'bańka', 'rolki',
  'wrotki', 'karty', 'talia', 'as', 'joker', 'szachy', 'warcaby', 'pionek', 'goniec',
  'skoczek', 'hetman', 'plansza', 'żeton', 'domino', 'puzzel', 'krzyżówka', 'zagadka',
  'rebus', 'kalambury', 'chowany', 'berek', 'klasy', 'kapsle', 'zośka', 'procak', 'bumerang',
  'frisbee', 'petarda', 'fajerwerk', 'konfetti', 'serpentyna', 'balonik', 'prezent',
  'świeczka'
];

const SYMBOLS = [
  'gwiazdka', 'strzałka', 'krzyż', 'koło', 'kwadrat', 'prostokąt', 'romb', 'owal', 'spirala',
  'zygzak', 'kropka', 'kreska', 'krzyżyk', 'kółko', 'znak', 'litera', 'cyfra', 'liczba',
  'plus', 'minus', 'równa', 'procent', 'nuta', 'słoneczko', 'chmurka', 'kropelka', 'płomień',
  'śnieżynka', 'listek', 'kwiatek', 'podkowa', 'czterolistna', 'sztandar', 'flaga',
  'proporzec', 'herb', 'pieczęć', 'stempel', 'odznaka', 'wstęga', 'girlanda', 'bukiet',
  'zegar', 'wskazówka', 'bomba', 'dynamit'
];

const MISC = [
  'miecz', 'armata', 'skarb', 'trumna', 'sztabka', 'diament', 'perła', 'klejnot', 'pierścień',
  'amulet', 'talizman', 'różdżka', 'kryształ', 'kotara', 'zwój', 'pergamin', 'księga',
  'atrament', 'kałamarz', 'lak', 'sygnet', 'wytrych', 'kajdany', 'krata', 'cela', 'katapulta',
  'taran', 'balista', 'trebusz', 'zbroja', 'napierśnik', 'nagolennik', 'przyłbica',
  'kolczuga', 'buzdygan', 'topór', 'halabarda', 'włócznia', 'proca', 'kusza', 'bełt',
  'kołczan', 'cięciwa', 'tarczownik', 'beczka', 'antałek', 'dzban', 'amfora', 'urna',
  'kadzidło', 'kadzielnica', 'kandelabr', 'pochodnia', 'ognisko', 'kominek', 'palenisko',
  'ruszt', 'rożen', 'kociołek', 'moździerz', 'tłuczek', 'sito', 'przetak', 'żarna',
  'kołowrotek', 'wrzeciono', 'krosno', 'igła', 'nitka', 'naparstek', 'szpulka', 'nożyczki',
  'centymetr', 'manekin', 'wykrój', 'łata', 'rzep', 'agrafka', 'szpilka', 'haftka', 'koronka',
  'frędzel'
];

const MORE = [
  'terrarium', 'klatka', 'buda', 'obroża', 'smycz', 'kaganiec', 'karmnik', 'poidło', 'ul',
  'kokon', 'gniazdo', 'jajo', 'skorupa', 'nora', 'legowisko', 'żłób', 'siodło', 'strzemię',
  'uzda', 'bat', 'lasso', 'ostroga', 'derka', 'chusteczka', 'serwetka', 'obrus', 'słomka',
  'korek', 'otwieracz', 'korkociąg', 'szczypce', 'szpatułka', 'trzepak', 'sznurek',
  'klamerka', 'żelazo', 'kaloryfer', 'grzejnik', 'wentylator', 'klimatyzator', 'nawilżacz',
  'oczyszczacz', 'piec', 'kocioł', 'bojler', 'kran', 'zlew', 'umywalka', 'wanna', 'prysznic',
  'brodzik', 'sedes', 'bidet', 'rura', 'syfon', 'odpływ', 'kratka', 'wentylacja', 'kontakt',
  'bezpiecznik', 'licznik', 'skrzynka', 'słup', 'przewód', 'izolacja', 'żarnik', 'wykładzina',
  'panel', 'parkiet', 'kafelek', 'płytka', 'cegła', 'pustak', 'beton', 'zaprawa', 'tynk',
  'farba', 'bejca', 'papier', 'tektura', 'folia', 'sznur', 'wstążeczka', 'wigwam', 'jurta',
  'szałas', 'bunkier', 'schron', 'piwniczka', 'altana', 'pergola', 'zjeżdżalnia',
  'piaskownica', 'ławka', 'słupek', 'barierka', 'poręcz', 'balustrada', 'krawężnik', 'próg',
  'schodek', 'stopień', 'podest', 'żagielek', 'kotwiczka', 'bosak', 'trap', 'iluminator',
  'reling', 'pokład', 'kajuta', 'ładownia', 'dziób', 'rufa', 'burta', 'kil', 'wciągarka',
  'blok', 'hak', 'zawiesie', 'pas', 'szelki', 'szczypczyki', 'punktak', 'rylec', 'pilniczek',
  'osełka', 'toczydło', 'kowadło', 'miech', 'forma', 'odlew', 'model', 'makieta', 'szkic',
  'rysunek', 'plan', 'schemat', 'wykres', 'tabela', 'sztaluga', 'paleta', 'płótno',
  'blejtram', 'werniks', 'węgiel', 'pastel', 'tusz', 'stalówka', 'pieczątka', 'poduszeczka',
  'grzywa', 'ogon', 'kopyto', 'pazur', 'szpon', 'skrzydło', 'płetwa', 'łuska', 'sierść',
  'futro', 'wełna', 'runo', 'poroże', 'kieł', 'garb', 'żądło', 'czułek', 'odnóże', 'pancerz',
  'skorupka', 'chałka', 'strucla', 'makowiec', 'keks', 'rolada', 'ciasteczko', 'krakers',
  'paluszek', 'chrupki', 'żelek', 'pianka', 'nugat', 'toffi', 'karmel', 'polewa', 'lukier',
  'posypka', 'wiórki', 'bita', 'sos', 'przyprawa', 'zioło', 'ziarno', 'strąk', 'pestka',
  'skórka', 'miąższ', 'ogryzek', 'plasterek', 'kromka', 'porcja', 'kęs', 'wieszaczek',
  'karnisz', 'listwa', 'gzyms', 'kolumna', 'filar', 'sklepienie', 'kopuła', 'iglica',
  'wieżyczka', 'blanki', 'fosa', 'zwodzony', 'krużganek', 'arkada', 'portal', 'witraż',
  'rozeta', 'mozaika', 'fresk', 'gobelin', 'żyrandolik', 'posąg', 'popiersie', 'sarkofag',
  'obelisk', 'stela', 'sfinks', 'totem', 'menhir', 'dolmen', 'chorągiew', 'lanca', 'buława',
  'berło', 'diadem', 'tiara', 'naramiennik', 'karwasz', 'trzewik', 'szyszak', 'kapturek',
  'welon', 'tren', 'gorset', 'krynolina', 'halka', 'żabot', 'mankiet', 'kołnierz', 'klapa',
  'szew', 'obszycie', 'lamówka', 'naszywka', 'emblemat', 'plakietka', 'przypinka',
  'breloczek', 'wisiorek', 'łańcuszek', 'zapinka', 'klips', 'grzebyczek', 'wsuwka',
  'kajdanki', 'pałka', 'mandat', 'gaśnica', 'hydrant', 'drabinka', 'nosze', 'kroplówka',
  'stetoskop', 'opatrunek', 'gips', 'proteza', 'zastrzyk', 'szczepionka', 'probówka', 'kolba',
  'zlewka', 'pipeta', 'palnik', 'statyw', 'szalka', 'menzurka', 'lejek', 'moździerzyk',
  'wirówka', 'inkubator'
];

const LAST = [
  'abakus', 'akordeonista', 'ambulans', 'aparatura', 'arbuzik', 'archiwum', 'balustradka',
  'bandana', 'bombka', 'bransoleta', 'brukowiec', 'bryczka', 'centrala', 'chrabąszcz',
  'cukiernica', 'ćwiek', 'dorożka', 'dzida', 'estakada', 'gablota', 'girlandka', 'grabki',
  'gwoździk', 'hamak', 'kapelusik', 'karabin', 'kartacz', 'katamaranik', 'klapka', 'kloc',
  'kolczatka', 'kołatka', 'kompresor', 'konew', 'krzesełko', 'kuferek', 'lampion',
  'latarenka', 'lemiesz', 'lichtarz'
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
