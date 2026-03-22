/**
 * Export iCalendar (.ics) — all-day events (VALUE=DATE).
 * Same calendar date in any viewer (France / UK), no clock-time conversion.
 */
(function () {
    const CRLF = '\r\n';

    /** YYYY-MM-DD in the given timezone (civil date). */
    function ymdInTz(date, timeZone) {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(date);
    }

    /** Monday (civil date) of the week containing `ref` in `timeZone`. */
    function mondayYmdOfWeekContaining(ref, timeZone) {
        const refNoon = new Date(ref);
        refNoon.setUTCHours(12, 0, 0, 0);
        for (let i = 0; i < 7; i++) {
            const d = new Date(refNoon);
            d.setUTCDate(refNoon.getUTCDate() - i);
            const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d);
            if (wd === 'Mon') {
                return ymdInTz(d, timeZone);
            }
        }
        return ymdInTz(refNoon, timeZone);
    }

    function addCalendarDaysYmd(ymd, n) {
        const [y, m, d] = ymd.split('-').map(Number);
        const t = Date.UTC(y, m - 1, d + n);
        const dt = new Date(t);
        const y2 = dt.getUTCFullYear();
        const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const d2 = String(dt.getUTCDate()).padStart(2, '0');
        return `${y2}-${m2}-${d2}`;
    }

    /** YYYYMMDD for VALUE=DATE */
    function toIcsDate(ymd) {
        return ymd.replace(/-/g, '');
    }

    function escapeIcsText(s) {
        return String(s)
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\n/g, '\\n');
    }

    /** RFC 5545 line fold (75 octets; ASCII-safe). */
    function foldLine(line) {
        const max = 75;
        if (line.length <= max) return line;
        const out = [];
        let rest = line;
        while (rest.length > max) {
            out.push(rest.slice(0, max));
            rest = ' ' + rest.slice(max);
        }
        if (rest.length) out.push(rest);
        return out.join(CRLF);
    }

    function dtStampUtc() {
        return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    }

    function uidPart() {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }

    /** Short English label for the civil date (all-day event title). */
    function formatDaySummaryLabel(ymd) {
        const [y, m, d] = ymd.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        return new Intl.DateTimeFormat('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        }).format(dt);
    }

    function buildDayDescription(day, cleanupAsList, isPlaceholder) {
        const lines = [];
        lines.push(`Breakfast: ${isPlaceholder(day.breakfast) ? '—' : String(day.breakfast).trim()}`);
        lines.push(`Lunch: ${isPlaceholder(day.lunch) ? '—' : String(day.lunch).trim()}`);
        lines.push(`Dinner: ${isPlaceholder(day.supper) ? '—' : String(day.supper).trim()}`);

        const clean = cleanupAsList(day);
        if (day.cleanup === null) {
            lines.push('Clean-up: Off');
        } else if (clean.length > 0) {
            lines.push(`Clean-up: ${clean.join(', ')}`);
        } else {
            lines.push('Clean-up: —');
        }

        const adminEmpty = day.admin == null || String(day.admin).trim() === '';
        lines.push(`Admin: ${adminEmpty ? 'Off' : String(day.admin).trim()}`);

        const exEmpty = day.exercise == null || String(day.exercise).trim() === '';
        lines.push(`Exercise: ${exEmpty ? 'Off' : String(day.exercise).trim()}`);

        return lines.join('\n');
    }

    /**
     * @param {object[]} schedule — 28 days (Mon–Sun × 4 weeks)
     * @param {{ timeZone?: string, cleanupAsList?: (d: object) => string[] }} opts
     */
    function build(schedule, opts) {
        const timeZone = opts?.timeZone || 'Europe/Paris';
        const cleanupAsList =
            opts?.cleanupAsList ||
            function (day) {
                if (day.cleanup == null) return [];
                if (Array.isArray(day.cleanup)) return day.cleanup.filter(Boolean);
                return day.cleanup ? [day.cleanup] : [];
            };

        const lines = [];
        lines.push('BEGIN:VCALENDAR');
        lines.push('VERSION:2.0');
        lines.push('PRODID:-//Planning//Local//EN');
        lines.push('CALSCALE:GREGORIAN');
        lines.push('METHOD:PUBLISH');
        lines.push('X-WR-CALNAME:Planning');
        lines.push(`X-WR-TIMEZONE:${timeZone}`);

        const mondayYmd = mondayYmdOfWeekContaining(new Date(), timeZone);
        const stamp = dtStampUtc();

        const isPlaceholder = (v) => v == null || v === '' || String(v).trim() === '—';

        for (let i = 0; i < schedule.length; i++) {
            const day = schedule[i];
            if (!day) continue;

            const dateYmd = addCalendarDaysYmd(mondayYmd, i);
            const dateStr = toIcsDate(dateYmd);
            const nextStr = toIcsDate(addCalendarDaysYmd(dateYmd, 1));

            const summary = formatDaySummaryLabel(dateYmd);
            const description = buildDayDescription(day, cleanupAsList, isPlaceholder);

            lines.push('BEGIN:VEVENT');
            lines.push(foldLine(`UID:schedule-${i}-${uidPart()}@local`));
            lines.push(`DTSTAMP:${stamp}`);
            lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
            lines.push(`DTEND;VALUE=DATE:${nextStr}`);
            lines.push(foldLine(`SUMMARY:${escapeIcsText(summary)}`));
            lines.push(foldLine(`DESCRIPTION:${escapeIcsText(description)}`));
            lines.push('END:VEVENT');
        }

        lines.push('END:VCALENDAR');
        return lines.join(CRLF) + CRLF;
    }

    function download(icsString, filename) {
        const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'planning.ics';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    window.OrganisedIcal = {
        build,
        download,
        mondayYmdOfWeekContaining,
        addCalendarDaysYmd,
    };
})();
