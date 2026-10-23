package ca.leradar.app.news;

import static org.junit.Assert.*;

import org.junit.Test;

import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;

public class NewsAlertsDetectorTest {
    static final long NOW = 1_800_000_000_000L;
    static final long H = 3600_000L;

    static NewsAlertsDetector.Item it(String slug, String type, String region, long ageH) {
        return new NewsAlertsDetector.Item("Titre " + slug, "https://ex.ca/" + slug + "/?utm_source=rss",
            "Source", type, region, NOW - ageH * H);
    }

    final List<String> none = Collections.emptyList();

    @Test public void firstRunPrimesWithoutNotifying() {
        List<NewsAlertsDetector.Item> feed = Arrays.asList(it("a", "universite", "Montréal", 1), it("b", "cegep", "Estrie", 2));
        NewsAlertsDetector.Result r = NewsAlertsDetector.detect(feed, none, false, none, none, NOW);
        assertTrue(r.fresh.isEmpty());
        assertEquals(Arrays.asList("https://ex.ca/a", "https://ex.ca/b"), r.seen);
    }

    @Test public void onlyUnseenAreFreshNewestFirst() {
        List<String> seen = Arrays.asList("https://ex.ca/a");
        List<NewsAlertsDetector.Item> feed = Arrays.asList(it("c", "cegep", "Estrie", 3), it("a", "universite", "Montréal", 1), it("d", "universite", "Montréal", 0));
        NewsAlertsDetector.Result r = NewsAlertsDetector.detect(feed, seen, true, none, none, NOW);
        assertEquals(2, r.fresh.size());
        assertEquals("Titre d", r.fresh.get(0).title);
        assertEquals("Titre c", r.fresh.get(1).title);
        assertTrue(r.seen.contains("https://ex.ca/a"));
    }

    @Test public void canonicalIgnoresTrackingAndSlash() {
        assertEquals("https://ex.ca/x?id=2", NewsAlertsDetector.canonical("https://ex.ca/x/?utm_medium=rss&id=2#top"));
        assertEquals("", NewsAlertsDetector.canonical("javascript:alert(1)"));
        List<String> seen = Arrays.asList("https://ex.ca/a");
        NewsAlertsDetector.Item same = new NewsAlertsDetector.Item("T", "https://ex.ca/a/", "S", "cegep", "Estrie", NOW);
        assertTrue(NewsAlertsDetector.detect(Arrays.asList(same), seen, true, none, none, NOW).fresh.isEmpty());
    }

    @Test public void filtersByTypeAndRegion() {
        List<NewsAlertsDetector.Item> feed = Arrays.asList(it("u", "universite", "Montréal", 1), it("c", "cegep", "Estrie", 1), it("m", "cegep", "Montréal", 1));
        assertEquals(2, NewsAlertsDetector.detect(feed, none, true, Arrays.asList("cegep"), none, NOW).fresh.size());
        assertEquals(2, NewsAlertsDetector.detect(feed, none, true, none, Arrays.asList("Montréal"), NOW).fresh.size());
        List<NewsAlertsDetector.Item> both = NewsAlertsDetector.detect(feed, none, true, Arrays.asList("cegep"), Arrays.asList("Montréal"), NOW).fresh;
        assertEquals(1, both.size());
        assertEquals("Titre m", both.get(0).title);
    }

    @Test public void filteredItemsAreStillRemembered() {
        List<NewsAlertsDetector.Item> feed = Arrays.asList(it("c", "cegep", "Estrie", 1));
        NewsAlertsDetector.Result r = NewsAlertsDetector.detect(feed, none, true, Arrays.asList("universite"), none, NOW);
        assertTrue(r.fresh.isEmpty());
        assertTrue(r.seen.contains("https://ex.ca/c"));
    }

    @Test public void oldReappearingItemsAreSkipped() {
        assertTrue(NewsAlertsDetector.detect(Arrays.asList(it("old", "cegep", "Estrie", 72)), none, true, none, none, NOW).fresh.isEmpty());
    }

    @Test public void duplicatesAndUntitledIgnored() {
        NewsAlertsDetector.Item blank = new NewsAlertsDetector.Item("", "https://ex.ca/z", "S", "cegep", "Estrie", NOW);
        List<NewsAlertsDetector.Item> feed = Arrays.asList(it("a", "cegep", "Estrie", 1), it("a", "cegep", "Estrie", 1), blank);
        assertEquals(1, NewsAlertsDetector.detect(feed, none, true, none, none, NOW).fresh.size());
    }

    @Test public void memoryIsBounded() {
        String[] many = new String[1000];
        for (int i = 0; i < many.length; i++) many[i] = "https://old.ca/" + i;
        NewsAlertsDetector.Result r = NewsAlertsDetector.detect(Arrays.asList(it("n", "cegep", "Estrie", 0)), Arrays.asList(many), true, none, none, NOW);
        assertEquals(NewsAlertsDetector.SEEN_LIMIT, r.seen.size());
        assertEquals("https://ex.ca/n", r.seen.get(0));
    }

    static Calendar at(int h) { Calendar c = Calendar.getInstance(); c.set(Calendar.HOUR_OF_DAY, h); return c; }

    @Test public void quietHoursWrapMidnight() {
        assertTrue(NewsAlertsDetector.inQuietHours(at(22), 22, 7));
        assertTrue(NewsAlertsDetector.inQuietHours(at(3), 22, 7));
        assertFalse(NewsAlertsDetector.inQuietHours(at(7), 22, 7));
        assertFalse(NewsAlertsDetector.inQuietHours(at(15), 22, 7));
    }

    @Test public void intervalIsOneTwoOrFour() {
        assertEquals(1, NewsAlertsDetector.clampInterval(1));
        assertEquals(2, NewsAlertsDetector.clampInterval(3));
        assertEquals(4, NewsAlertsDetector.clampInterval(8));
    }

    @Test public void parsesRealFeedShape() throws Exception {
        String json = "{\"items\":[{\"title\":\"NAZA\",\"link\":\"https://q.ca/n/\",\"source\":\"Quartier Libre\",\"type\":\"universite\",\"region\":\"Montréal\",\"date\":\"2026-10-22T21:00:00.000Z\"}]}";
        List<NewsAlertsDetector.Item> items = NewsFeedParser.parse(json);
        assertEquals(1, items.size());
        assertEquals("Montréal", items.get(0).region);
        assertEquals(1792702800000L, items.get(0).dateMs);
    }
}
