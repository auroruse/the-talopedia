/**
 * Starting skeletons the editor loads when an article type is picked.
 *
 * Every one of these is derived from the articles that already exist rather than
 * invented: the rows are the ones those articles actually carry, in the order they
 * carry them. Rows are still a starting point and not a schema - editors add and
 * remove freely - but the starting point should not need undoing on every new page.
 */
const S = (section) => ({ section });
const L = (label, sub = false) => ({ label, value: '', sub });
const I = (caption = '') => ({ image: '', caption });
// Two columns side by side, as a battle's belligerents or its commanders.
const P = () => ({ pair: [{ items: [] }, { items: [] }] });
// An office held and the term served in it.
const O = () => ({ office: '', term: '' });
// A value with no label, spanning the row under its heading, as a scoreline.
const V = () => ({ value: '' });

export const TEMPLATES = {
  // ---- places ----
  overview: [
    I('Flag'), I('Coat of Arms'),
    L('Motto'), L('Anthem'), L('Capital'), L('Largest City'),
    S('Administration'), L('Government'), L('Legislature'), L('Formation'),
    S('Demographics'),
    L('Population'), L('Total', true), L('Density', true),
    L('Ethnic Groups'), L('Religion'),
    L('Official Languages'), L('Recognized Regional Languages'), L('Demonym(s)'),
    L('GDP (PPP)'), L('Total', true), L('Per Capita', true),
    L('Currency'), L('Life Expectancy'), L('Literacy Rate'), L('HDI'),
    S('Miscellaneous Info'),
    L('Land Area'), L('Water Area'), L('Date Format'), L('Driving Side'),
    L('Alpha-2 Code'), L('Alpha-3 Code'),
  ],
  city: [
    I(), I('Flag'), I('Location'),
    L('Motto'),
    S('Geography'), L('Country'), L('Region'), L('Prefecture'), L('Area'), L('Total', true),
    S('Administration'), L('Body'), L('Type'), L('Governor', true),
    S('Demographics'),
    L('Population'), L('Total', true), L('Density', true),
    L('Ethnic Groups'), L('Religion'), L('Demonym(s)'),
    L('GDP (PPP)'), L('Total', true), L('Per Capita', true),
    L('Life Expectancy'), L('Literacy Rate'),
  ],
  // A province, county, territory or autonomous region inside a nation.
  subdivision: [
    I('Flag'), I('Location'),
    S('Geography'), L('Country'), L('Capital'), L('Largest City'),
    L('Highest Elevation'), L('Water %'), L('Area'), L('Total', true),
    S('Legislature'), L('Delegates'), L('Senators'), L('Governor'),
    S('Demographics'),
    L('Population'), L('Total', true), L('Density', true),
    L('Ethnic Groups'), L('Religion'),
    S('Administrative Divisions'), L(''),
  ],
  continent: [
    I(),
    L('Land Area'), L('Entities'), L('Largest City'),
    S('Demographics'),
    L('Population'), L('Total', true), L('Density', true), L('Demonym(s)'),
    L('GDP (PPP)'), L('Total', true), L('Per Capita', true),
  ],
  // A landform: a range, a peak, a lake, a river, an island.
  geography: [
    I(),
    L('Type'), L('Country'), L('Location'),
    S('Dimensions'), L('Elevation'), L('Length'), L('Area'), L('Depth'),
  ],
  // A planet, a moon or a star system.
  celestial: [
    I(),
    S('Orbital Characteristics'),
    L('Central Body'), L('Semi-Major Axis'), L('Average Orbital Speed'),
    L('Satellites'), L('Orbital Period'),
    S('Rotational Characteristics'), L('Axial Tilt'), L('Rotational Period'),
    S('Physical Characteristics'),
    L('Mass'), L('Surface Area'), L('Volume'), L('Mean Radius'), L('Mean Density'),
    L('Surface Gravity'), L('Albedo'), L('Magnitude'),
    S('Surface Conditions'),
    L('Effective Temperature'), L('Surface Temperature'), L('Surface Pressure'),
    L('Atmospheric Composition'),
  ],

  // ---- people and bodies ----
  character: [
    I(),
    O(), L('Preceded by'), L('Succeeded by'),
    S('Personal Details'),
    L('Born'), L('Died'), L('Nationality'), L('Ethnicity'), L('Religion'),
    L('Parents'), L('Spouse'), L('Children'), L('Alma Mater'),
    S('Nichirian Name'),
    L('Kanji'), L('Aldrige Rōmaji'), L('Given Name Meaning'), L('Literal Meaning'),
  ],
  military: [
    I('Flag'),
    L('Motto'), L('Founded'), L('Service Branches'), L('Headquarters'),
    S('Leadership'), L('Commander-in-Chief'), L('Minister of Defense'),
    L('Chief of the General Staff'),
    S('Personnel'), L('Military Age'), L('Conscription'),
    L('Active Personnel'), L('Reserve Personnel'),
    S('Expenditure'), L('Budget'), L('Percent of GDP', true),
    S('Industry'), L('Domestic Suppliers'), L('Foreign Suppliers'),
    L('Annual Imports'), L('Annual Exports'),
  ],
  organization: [
    I('Emblem'),
    L('Motto'), L('Headquarters'), L('Founded'),
    S('Leadership'), L('Director'),
    S('Personnel'), L('Conscription'), L('Active Personnel'), L('Reserve Personnel'),
    S('Expenditure'), L('Budget'),
  ],
  company: [
    I('Logo'),
    L('Founded'), L('Founder'), L('Headquarters'), L('Areas Served'), L('Industries'),
    S('Finances'), L('Revenue'), L('Net Income'), L('Total Assets'),
    S('Key People'), L('Executive Chairman'), L('President & CEO'),
    L('Chief Financial Officer'),
  ],
  ideology: [
    I(),
    L('Type'), L('Founded'), L('Founder'), L('Key Figures'),
    S('Lineage'), L('Influenced by'), L('Influenced'),
  ],
  religion: [
    I(),
    S('Classification'), L('Type'), L('Theology'), L('Orientation'),
    S('Scripture'), L('Primary Text'), L('Secondary Text'),
    S('Administration'), L('Structure'), L('Leadership'), L('Priestly Class'),
    S('History'), L('Founded'), L('Founded at'), L('Founder'),
    S('Demographics'), L('Followers'), L('Majority Region'),
    S('Symbols'), L('Primary'), L('Secondary'), L('Sacred Object'),
  ],
  ethnicity: [
    I(),
    L('Population'), L('Regions'), L('Languages'), L('Religion'), L('Related Groups'),
  ],

  // ---- sport ----
  // Each is the sidebar of the article named, with its own details taken out.
  // The Nichirin national football team.
  'national-team': [
    I(),
    L('Nickname'), L('Association'), L('Confederation'), L('Manager'),
    L('Most Caps'), L('Top Scorer'), L('Home Stadium'), L('AFA Code'),
    I(),
    S('AFA Ranking'), L('Current'), L('Highest'), L('Lowest'),
    S('First International'), V(),
    S('Biggest Win'), V(),
    S('Biggest Defeat'), V(),
    S('World Cup'), L('First Appearance'), L('Best Result'),
  ],
  // The Karjanian Secondary League; Nichirin has no league article yet.
  league: [
    I('Emblem'),
    L('Founded'), L('Country'), L('Number of teams'), L('Level on pyramid'),
    L('Promotion to'), L('Relegation to'),
    L('Domestic Cup'), L('Domestic Super Cup'), L('International Cups'),
    L('Reigning champion'), L('Most championships'),
  ],
  // The Karjanian Cup; Nichirin has no cup article yet.
  cup: [
    I('Logo'),
    L('Founded'), L('Organizer'), L('Region(s)'), L('Teams'), L('Qualification for'),
    L('Current Champions'), L('Most Championships'),
  ],
  // Arkankeli Racecourse; Nichirin has no racecourse article yet.
  racecourse: [
    I(),
    L('Founded'), L('Capacity'), L('Event Type'), L('Location'), L('Country'),
    L('Notable Races'),
    S('Records'), L('Most Wins'), L('Most Races'),
  ],
  // The Thousand Lakes Derby; Nichirin has no horse race article yet.
  'horse-race': [
    I('Logo'),
    L('Class'), L('Location'), L('Country'), L('Inaugurated'), L('Race type'),
    S('Race information'), L('Surface'), L('Distance'), L('Track'), L('Purse'),
  ],

  // ---- everything else ----
  event: [
    I(),
    L('Date'), L('Location'), L('Result'), L('Territorial Changes'),
    S('Belligerents'), P(),
    S('Commanders and Leaders'), P(),
    S('Strength'), P(),
    S('Casualties and Losses'), P(),
  ],
  list: [],
};
