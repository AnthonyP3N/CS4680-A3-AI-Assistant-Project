// Sample data: two realistic weeks for a student, generated relative to
// "today" so the dashboard and AI review always have something to show.
// Nothing is placed in the future.

import { addDays, zonedTimeToIso } from './dates.js';
import { emptyDb, newId } from './db.js';

export function buildSampleDb(tz = 'America/Los_Angeles', today) {
  const db = emptyDb();
  db.preferences.timezone = tz;
  const at = (offset, hhmm) => zonedTimeToIso(addDays(today, offset), hhmm, tz);
  const nowMs = Date.now();

  const task = (t) => {
    const full = {
      id: newId('task'), category: 'Homework', priority: 'medium', dueDate: null, estimateMinutes: null,
      status: 'todo', notes: '', parentId: null, createdAt: at(-14, '08:00'), completedAt: null, ...t,
    };
    db.tasks.push(full);
    return full;
  };
  const session = (t, offset, endHHMM, minutes, note = '') => {
    const endedAt = at(offset, endHHMM);
    if (Date.parse(endedAt) > nowMs) return;
    db.sessions.push({
      id: newId('ses'), taskId: t.id, taskTitleSnapshot: t.title, categorySnapshot: t.category,
      status: 'stopped', source: 'timer', startedAt: new Date(Date.parse(endedAt) - minutes * 60000).toISOString(),
      endedAt, lastResumedAt: null, accumulatedSeconds: minutes * 60, durationSeconds: minutes * 60, note,
    });
  };
  const done = (t, offset, hhmm) => { t.status = 'done'; t.completedAt = at(offset, hhmm); };
  const journal = (offset, hhmm, body, tags, taskId = null) => {
    const energy = tags.includes('energy-low') ? 'low' : tags.includes('energy-high') ? 'high' : null;
    db.journal.push({ id: newId('jrn'), body, tags: tags.filter((t) => !t.startsWith('energy-')), energy, taskId, sessionId: null, createdAt: at(offset, hhmm) });
  };

  // ---- Completed work (previous ~2 weeks) ----
  const calc5 = task({ title: 'Calculus problem set 5', priority: 'high', dueDate: addDays(today, -10), estimateMinutes: 90 });
  session(calc5, -11, '21:10', 50); session(calc5, -10, '17:00', 55); done(calc5, -10, '17:00');

  const os4 = task({ title: 'Read Ch. 4 – Operating Systems', category: 'Studying', dueDate: addDays(today, -9), estimateMinutes: 60 });
  session(os4, -9, '10:45', 45); done(os4, -9, '10:45');

  const outline = task({ title: 'English essay outline', priority: 'high', dueDate: addDays(today, -8), estimateMinutes: 45 });
  session(outline, -8, '20:30', 70, 'Rewrote the thesis three times'); done(outline, -8, '20:30');

  const inventory = task({ title: 'Inventory sheet for work', category: 'Work', priority: 'low', dueDate: addDays(today, -8), estimateMinutes: 30 });
  session(inventory, -8, '16:25', 25); done(inventory, -8, '16:25');

  const lab = task({ title: 'CS4680 prompt lab', priority: 'high', dueDate: addDays(today, -6), estimateMinutes: 120 });
  session(lab, -7, '15:00', 60); session(lab, -7, '21:00', 50); session(lab, -6, '11:15', 45); done(lab, -6, '11:15');

  const gym = task({ title: 'Gym', category: 'Exercise', priority: 'low', dueDate: addDays(today, -5), estimateMinutes: 60 });
  session(gym, -5, '18:30', 60); done(gym, -5, '18:30');

  const physics = task({ title: 'Physics lab report', priority: 'high', dueDate: addDays(today, -3), estimateMinutes: 90 });
  session(physics, -4, '20:00', 75); session(physics, -3, '14:20', 50, 'Data analysis took longest'); done(physics, -3, '14:20');

  const os5 = task({ title: 'Read Ch. 5 – Operating Systems', category: 'Studying', dueDate: addDays(today, -2), estimateMinutes: 60 });
  session(os5, -2, '10:20', 50); done(os5, -2, '10:20');

  const resume = task({ title: 'Update resume', category: 'Personal', dueDate: addDays(today, -1), estimateMinutes: 45 });
  session(resume, -1, '19:40', 40); done(resume, -1, '19:40');

  // Due in the past but not finished (keeps the completion rate honest).
  task({ title: 'Lab safety quiz', category: 'Studying', priority: 'low', dueDate: addDays(today, -4), estimateMinutes: 20 });

  // ---- Open work ----
  task({ title: 'CS4680 homework 4', priority: 'high', dueDate: today, estimateMinutes: 120, notes: 'Prompt patterns write-up + code' });
  const calc7 = task({ title: 'Calculus problem set 7', priority: 'high', dueDate: addDays(today, 1), estimateMinutes: 90 });
  session(calc7, -1, '16:00', 30);
  calc7.status = 'in_progress';
  task({ title: 'Prepare for OS quiz', category: 'Studying', dueDate: addDays(today, 2), estimateMinutes: 60 });
  task({ title: 'English essay draft', dueDate: addDays(today, 3), estimateMinutes: 150, notes: '1500 words, MLA' });
  task({ title: 'Team meeting notes', category: 'Work', priority: 'low', dueDate: addDays(today, 5), estimateMinutes: 30 });
  task({ title: 'Apply to 2 internships', category: 'Personal', priority: 'low', estimateMinutes: 45 });

  // ---- Journal ----
  journal(-8, '20:40', 'Essay outline took way longer than I planned. Kept rewriting the thesis instead of moving on.', ['stuck', 'reflection'], outline.id);
  journal(-6, '11:30', 'Prompt lab went well once I put my phone in another room.', ['win', 'distraction'], lab.id);
  journal(-5, '21:00', 'Tired after my work shift, only managed the gym.', ['energy-low']);
  journal(-3, '14:30', 'Physics report: the data analysis section was the slow part, not the writing.', ['reflection'], physics.id);
  journal(-2, '10:30', 'Library in the morning = best focus all week.', ['win', 'energy-high'], os5.id);
  journal(-1, '19:50', 'Kept checking messages while editing my resume.', ['distraction'], resume.id);

  return db;
}
