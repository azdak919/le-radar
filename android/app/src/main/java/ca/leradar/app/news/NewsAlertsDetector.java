package ca.leradar.app.news;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Détection des nouveaux articles du fil (news.json). Java pur, sans Android :
 * testé en JUnit. Un article est « nouveau » si son lien canonique n'a jamais
 * été vu sur l'appareil et qu'il passe les filtres de sections (type, région).
 */
public final class NewsAlertsDetector {
    /** Taille max. de la mémoire des liens vus (le fil en garde ~180). */
    public static final int SEEN_LIMIT = 600;
    /** Au-delà, un article qui « réapparaît » n'est pas une nouveauté. */
    public static final long MAX_AGE_MS = 48L * 3600 * 1000;

    private NewsAlertsDetector() {}

    public static final class Item {
        public final String title, link, source, type, region;
        public final long dateMs;

        public Item(String title, String link, String source, String type, String region, long dateMs) {
            this.title = title == null ? "" : title.trim();
            this.link = link == null ? "" : link.trim();
            this.source = source == null ? "" : source.trim();
            this.type = type == null ? "" : type.trim();
            this.region = region == null ? "" : region.trim();
            this.dateMs = dateMs;
        }
    }

    public static final class Result {
        /** Nouveautés à notifier, plus récentes d'abord. */
        public final List<Item> fresh;
        /** Mémoire mise à jour (tous les liens du fil, filtrés ou non). */
        public final List<String> seen;

        Result(List<Item> fresh, List<String> seen) {
            this.fresh = fresh;
            this.seen = seen;
        }
    }

    /** Lien canonique : même règle que core.js (sans utm_*, ni #, ni / final). */
    public static String canonical(String link) {
        if (link == null) return "";
        String s = link.trim();
        if (!s.startsWith("https://") && !s.startsWith("http://")) return "";
        int hash = s.indexOf('#');
        if (hash >= 0) s = s.substring(0, hash);
        int q = s.indexOf('?');
        String base = q >= 0 ? s.substring(0, q) : s;
        StringBuilder kept = new StringBuilder();
        if (q >= 0) {
            for (String part : s.substring(q + 1).split("&")) {
                if (part.isEmpty() || part.toLowerCase(Locale.ROOT).startsWith("utm_")) continue;
                kept.append(kept.length() == 0 ? "?" : "&").append(part);
            }
        }
        while (base.endsWith("/") && base.length() > 8) base = base.substring(0, base.length() - 1);
        return base + kept;
    }

    static boolean matches(Item item, Collection<String> types, Collection<String> regions) {
        if (types != null && !types.isEmpty() && !types.contains(item.type)) return false;
        if (regions != null && !regions.isEmpty() && !regions.contains(item.region)) return false;
        return true;
    }

    /**
     * @param primed false au premier passage : on mémorise le fil sans notifier
     *               (pas de rafale de 180 notifications à l'activation).
     */
    public static Result detect(List<Item> items, Collection<String> seenBefore, boolean primed,
                                Collection<String> types, Collection<String> regions, long nowMs) {
        Set<String> seen = new LinkedHashSet<>(seenBefore == null ? Collections.<String>emptyList() : seenBefore);
        List<Item> fresh = new ArrayList<>();
        Set<String> batch = new LinkedHashSet<>();
        for (Item item : items) {
            String key = canonical(item.link);
            if (key.isEmpty() || item.title.isEmpty() || !batch.add(key)) continue;
            if (!primed || seen.contains(key)) continue;
            if (item.dateMs > 0 && nowMs - item.dateMs > MAX_AGE_MS) continue;
            if (!matches(item, types, regions)) continue;
            fresh.add(item);
        }
        Collections.sort(fresh, (a, b) -> Long.compare(b.dateMs, a.dateMs));
        // Liens du fil en tête, puis l'ancienne mémoire, bornée.
        List<String> next = new ArrayList<>(batch);
        for (String key : seen) {
            if (next.size() >= SEEN_LIMIT) break;
            if (!batch.contains(key)) next.add(key);
        }
        if (next.size() > SEEN_LIMIT) next = new ArrayList<>(next.subList(0, SEEN_LIMIT));
        return new Result(fresh, next);
    }

    /** Heures de silence [start, end) en heure locale ; gère le passage de minuit. */
    public static boolean inQuietHours(Calendar now, int startHour, int endHour) {
        if (startHour == endHour) return false;
        int h = now.get(Calendar.HOUR_OF_DAY);
        return startHour < endHour ? (h >= startHour && h < endHour) : (h >= startHour || h < endHour);
    }

    public static int clampInterval(int hours) {
        return hours <= 1 ? 1 : hours >= 4 ? 4 : 2;
    }
}
