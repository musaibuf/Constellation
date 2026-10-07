// ============================================================
// ACCOUNTABILITY PUZZLE: QUESTION BANK
// 25 fast food branch manager scenarios, 3 choices each.
// Choice position sets the digit: first = 1, second = 2, third = 3.
// Every choice maps to one of the five accountability behaviours.
// There are no wrong answers; the spread of choices is the debrief.
// Balance: each behaviour appears exactly 15 times across the bank.
// ============================================================

const BEHAVIORS = ['Own It', 'Show Up', 'Ask for Help', 'Lift Others', 'Reflect & Learn'];

const BEHAVIOR_DEFINITIONS = {
  'Own It': "Take responsibility for your work, your mistakes, your branch's results. No excuses.",
  'Show Up': 'Deliver on time, with quality, so your team and customers can count on you.',
  'Ask for Help': "Raise your hand when stuck. Don't pretend you know. Bring others into the problem.",
  'Lift Others': "When someone struggles, support them. Don't let them fail alone. Build their capability.",
  'Reflect & Learn': "When you miss, pause and understand why. Don't repeat the same mistake. Grow.",
};

const SCENARIOS = [
  // ---------------- Customer Service & Recovery (5) ----------------
  {
    id: 'S01', category: 'Customer Service & Recovery',
    text: "A regular customer is upset. Their last three orders had missing items and they're posting complaints online. You find out at the end of your shift. What's your immediate response?",
    options: [
      { title: 'Apologise and compensate immediately', detail: 'I call the customer, apologise on behalf of the team, and offer a full refund plus a free meal voucher for their next visit.', behavior: 'Show Up' },
      { title: 'Understand the root cause first, then solve', detail: "I ask the team what happened on those three orders, find the gap in our process, fix it, then contact the customer with an apology and what we've changed.", behavior: 'Reflect & Learn' },
      { title: 'Involve your team in the recovery', detail: 'I call the customer and apologise, then bring my team together to discuss how we let this slip and what each person commits to.', behavior: 'Lift Others' },
    ],
  },
  {
    id: 'S02', category: 'Customer Service & Recovery',
    text: "It's 8:30 pm on a Friday. Delivery orders are running 25 minutes late, riders are crowding the counter, and two dine-in customers say the app showed 'ready' 15 minutes ago. What do you do first?",
    options: [
      { title: 'Take the floor yourself', detail: 'I step onto the expo line, call out orders, and personally hand over the next ten bags so the backlog clears.', behavior: 'Show Up' },
      { title: 'Pull in support', detail: 'I call the area manager and the nearest branch to ask if they can take some delivery orders off us while we recover.', behavior: 'Ask for Help' },
      { title: 'Own the message', detail: "I go to the waiting customers myself, tell them it's on us, give an honest wait time, and offer something for the delay.", behavior: 'Own It' },
    ],
  },
  {
    id: 'S03', category: 'Customer Service & Recovery',
    text: "A family's birthday order of four buckets was promised for 7 pm. At 6:45 the kitchen realises there isn't enough marinated chicken. The family is already seated. How do you respond?",
    options: [
      { title: 'Tell them now', detail: 'I go to the family immediately, explain the shortfall honestly, tell them exactly what we can serve and when, and adjust the bill.', behavior: 'Own It' },
      { title: 'Borrow stock', detail: 'I call the nearest branch to send marinated stock with a rider, and keep the family updated every ten minutes.', behavior: 'Ask for Help' },
      { title: 'Find the gap afterwards', detail: 'I serve what we can, then sit with the prep lead to trace why our forecast missed a confirmed pre-order.', behavior: 'Reflect & Learn' },
    ],
  },
  {
    id: 'S04', category: 'Customer Service & Recovery',
    text: 'A cashier gave a customer the wrong change and the customer is now shouting at her in front of a full queue. She looks shaken. What do you do?',
    options: [
      { title: 'Step in beside her', detail: 'I stand next to her, take over the conversation calmly, fix the change, and check she is okay once the customer leaves.', behavior: 'Lift Others' },
      { title: 'Check if it is a pattern', detail: "I settle the customer, then check the till count and the shift's other transactions to see whether this is a one-off or a pattern.", behavior: 'Reflect & Learn' },
      { title: 'Keep the line moving', detail: 'I open a second till myself so the queue keeps moving while she finishes with the customer.', behavior: 'Show Up' },
    ],
  },
  {
    id: 'S05', category: 'Customer Service & Recovery',
    text: 'An online review says your staff were rude and the food was cold. It is getting likes, and your area manager has already seen it. What is your move?',
    options: [
      { title: 'Respond and take responsibility', detail: 'I reply publicly, take responsibility without excuses, and invite the customer back so we can make it right.', behavior: 'Own It' },
      { title: 'Check before reacting', detail: 'I pull the order time, check CCTV and talk to the shift team to understand what actually happened before I respond.', behavior: 'Reflect & Learn' },
      { title: 'Ask how to handle it', detail: "I call the area manager first, share what I know, and ask how they'd like brand-level complaints like this handled.", behavior: 'Ask for Help' },
    ],
  },

  // ---------------- Quality & Standards (5) ----------------
  {
    id: 'S06', category: 'Quality & Standards',
    text: "On a walk-through you notice the evening shift's fries don't meet the colour and crispness standard. You know the shift lead is under pressure with new team members. How do you handle it?",
    options: [
      { title: 'Address it directly and set the standard high', detail: "I pull the shift lead aside, show them the standard, and say this isn't acceptable. I stay and coach the next batch to the right standard.", behavior: 'Own It' },
      { title: "Find out what's blocking them", detail: "I ask the shift lead what's making it hard to hit the standard. Short-staffed? Unclear on the process? We diagnose the blocker together.", behavior: 'Ask for Help' },
      { title: 'Use it as a teaching moment', detail: 'I gather the evening team, explain why the standard matters to customers, show what right looks like, and ask what support they need to own it.', behavior: 'Lift Others' },
    ],
  },
  {
    id: 'S07', category: 'Quality & Standards',
    text: "Your mystery shopper score dropped from 92 to 78. The biggest loss was product temperature. Your team says the holding cabinet is unreliable. What do you do?",
    options: [
      { title: "Own the score", detail: "I tell my team the score is mine, not the cabinet's, and we start checking product temperature every 30 minutes from today.", behavior: 'Own It' },
      { title: 'Raise the equipment issue', detail: "I log a maintenance ticket and ask the area engineer to visit this week, so the team isn't fighting broken equipment.", behavior: 'Ask for Help' },
      { title: 'Check it yourself every peak', detail: "I personally check product temperature at every peak this week until the score is back where it belongs.", behavior: 'Show Up' },
    ],
  },
  {
    id: 'S08', category: 'Quality & Standards',
    text: 'During a rush you see a crew member skip the fryer timer on a batch to save time. The chicken looks fine. What do you do?',
    options: [
      { title: 'Stop it now', detail: 'I pull the batch, remind them the timer is not optional, and make sure the next batch is done right.', behavior: 'Show Up' },
      { title: 'Coach after the rush', detail: 'After the rush I take them aside, explain why timings exist, and pair them with a senior for the next shift.', behavior: 'Lift Others' },
      { title: 'Ask why first', detail: 'I ask what made them skip it. Are the fryers backed up? Is our rush planning wrong? Then I decide what to fix.', behavior: 'Reflect & Learn' },
    ],
  },
  {
    id: 'S09', category: 'Quality & Standards',
    text: 'Head office launches a new burger with a strict assembly standard. After one week, your assembly accuracy is the lowest in your region. What is your first move?',
    options: [
      { title: 'Be on the station', detail: 'I spend the next three lunch rushes on the assembly station myself until we hit the standard.', behavior: 'Show Up' },
      { title: 'Learn from the best', detail: "I call the branch manager who's top in the region and ask what they did differently in week one.", behavior: 'Ask for Help' },
      { title: 'Grow station coaches', detail: "I pick two crew members who've got it right and make them station coaches for everyone else.", behavior: 'Lift Others' },
    ],
  },
  {
    id: 'S10', category: 'Quality & Standards',
    text: "A delivery customer sends a photo of a crushed burger and a leaking drink. It's the third packaging complaint this month. What do you do?",
    options: [
      { title: 'Own it with the customer', detail: "I call the customer, apologise, replace the order, and tell them I'm personally checking packing tonight.", behavior: 'Own It' },
      { title: 'Find the common cause', detail: 'I look at all three complaints together, times, packers and riders, to find what they have in common.', behavior: 'Reflect & Learn' },
      { title: 'Let the packers fix it', detail: 'I gather the packers, show them the photo, and let them design a better packing check together.', behavior: 'Lift Others' },
    ],
  },

  // ---------------- People Management & Development (5) ----------------
  {
    id: 'S11', category: 'People Management & Development',
    text: 'Your shift lead is losing confidence after a bad service rush. The team feels it. What do you do?',
    options: [
      { title: 'Rebuild their confidence', detail: "I sit with them after the shift, tell them one bad rush doesn't define them, and plan tomorrow's rush together.", behavior: 'Lift Others' },
      { title: 'Run the next rush alongside them', detail: 'I work the next rush beside them so they can see it can be done, then hand it back.', behavior: 'Show Up' },
      { title: 'Learn from it together', detail: 'I ask what went wrong from their view, and share a rush I got wrong early in my career and what I learned.', behavior: 'Reflect & Learn' },
    ],
  },
  {
    id: 'S12', category: 'People Management & Development',
    text: 'A new crew member is slow on the till and customers are getting impatient. Two senior crew are openly complaining about her. What do you do?',
    options: [
      { title: 'Pair her up', detail: 'I pair her with my best cashier for the next three shifts and tell the seniors their job is to help, not complain.', behavior: 'Lift Others' },
      { title: 'Own her readiness', detail: "I tell the seniors her training is my responsibility. If she's not ready, that's on me, not her.", behavior: 'Own It' },
      { title: 'Get proper training support', detail: 'I ask the training team for a refresher module so she gets real support, not just on-the-job pressure.', behavior: 'Ask for Help' },
    ],
  },
  {
    id: 'S13', category: 'People Management & Development',
    text: "Your best crew member tells you he's been offered a job at a competitor for slightly more pay. He's undecided. What do you do?",
    options: [
      { title: 'Show him his path here', detail: 'I talk honestly about his growth here and lay out a clear path to shift lead in the next few months.', behavior: 'Lift Others' },
      { title: 'Check your options first', detail: 'I check with my area manager and HR what options I genuinely have before I promise him anything.', behavior: 'Ask for Help' },
      { title: 'Look at what you missed', detail: "I ask myself why I didn't see this coming, and what I've missed about what my team actually needs.", behavior: 'Reflect & Learn' },
    ],
  },
  {
    id: 'S14', category: 'People Management & Development',
    text: "Two crew members on the same shift keep clashing and it's starting to affect service. Both blame each other. What do you do?",
    options: [
      { title: 'Set the line today', detail: 'I sit them down together, set clear expectations for behaviour on my floor, and make it clear it ends today.', behavior: 'Own It' },
      { title: 'Hear both sides first', detail: "I talk to each of them separately to understand what's really going on before deciding anything.", behavior: 'Reflect & Learn' },
      { title: 'Protect service first', detail: 'I move them to different stations so service stays steady while I sort it out properly.', behavior: 'Show Up' },
    ],
  },
  {
    id: 'S15', category: 'People Management & Development',
    text: "You can recommend one crew member for the shift lead programme. Your strongest performer isn't great with people; a quieter one coaches everyone around her. Who, and how?",
    options: [
      { title: 'Back the coach', detail: 'I recommend the quieter one, and tell the strong performer exactly what to work on to be ready next time.', behavior: 'Lift Others' },
      { title: 'Get other views', detail: "I ask my area manager and two shift leads for their view before I decide, so it isn't just my bias.", behavior: 'Ask for Help' },
      { title: 'Stand by the call', detail: 'Whoever I pick, I own the decision and explain it to both of them face to face.', behavior: 'Own It' },
    ],
  },

  // ---------------- Cleanliness & Safety (3) ----------------
  {
    id: 'S16', category: 'Cleanliness & Safety',
    text: "Your branch missed the cleanliness standard last week. What do you own, and what's your first move?",
    options: [
      { title: 'Own the miss', detail: 'I tell the team the miss is mine, then personally walk the closing checklist with the closing crew tonight.', behavior: 'Own It' },
      { title: 'Be there at close', detail: 'I stay for closing every night this week until the checklist gets done right without me.', behavior: 'Show Up' },
      { title: 'Make them champions', detail: "I make the closing team cleanliness champions: each person owns one area and checks another's.", behavior: 'Lift Others' },
    ],
  },
  {
    id: 'S17', category: 'Cleanliness & Safety',
    text: "A crew member slips on a wet kitchen floor. She isn't seriously hurt, but there was no wet-floor sign out. What do you do?",
    options: [
      { title: 'Take responsibility', detail: 'I make sure she is looked after, fill in the incident report honestly, and take responsibility for the missing sign.', behavior: 'Own It' },
      { title: 'Bring in the safety team', detail: "I check on her, then ask the safety team to review our kitchen floor routine. I don't want to guess at the fix.", behavior: 'Ask for Help' },
      { title: 'Guard the floor yourself', detail: 'I stay on the floor for the rest of the shift and make sure every spill is signed and cleared immediately.', behavior: 'Show Up' },
    ],
  },
  {
    id: 'S18', category: 'Cleanliness & Safety',
    text: 'During the Ramzan iftar rush, your team is cutting corners on hand-washing between raw and cooked handling. Everyone is exhausted. What do you do?',
    options: [
      { title: 'Model it first', detail: 'I stop the line for one minute, remind everyone why it matters, and wash my own hands first in front of them.', behavior: 'Show Up' },
      { title: 'Take the load off them', detail: "I put one extra person on raw handling only, so the others aren't forced to keep switching.", behavior: 'Lift Others' },
      { title: 'Ask for more hands', detail: 'I ask the area manager for an extra crew member on iftar shifts for the rest of Ramzan.', behavior: 'Ask for Help' },
    ],
  },

  // ---------------- Discipline & Accountability (3) ----------------
  {
    id: 'S19', category: 'Discipline & Accountability',
    text: "A crew member has been 10 to 15 minutes late every few days for a month. He's a good worker otherwise. What do you do?",
    options: [
      { title: 'Set a clear standard', detail: 'I talk to him privately, explain the impact on his team, and agree a clear standard with a clear consequence.', behavior: 'Own It' },
      { title: "Understand what's behind it", detail: "I ask what's going on, transport, family, a second job, before deciding how to handle it.", behavior: 'Reflect & Learn' },
      { title: 'Help him get there', detail: "If there's a genuine reason, I adjust his start time for a month and check in with him every week.", behavior: 'Lift Others' },
    ],
  },
  {
    id: 'S20', category: 'Discipline & Accountability',
    text: "You find out a shift lead has been giving free meals to friends. The amounts are small, but the crew knows. What do you do?",
    options: [
      { title: 'Deal with it directly', detail: 'I address it with him privately the same day and follow the policy, even though I like him.', behavior: 'Own It' },
      { title: 'Get it right with HR', detail: 'I speak to HR first to make sure I handle it fairly and by the book.', behavior: 'Ask for Help' },
      { title: 'Reset the rule for everyone', detail: 'I reset the standard with the whole team so everyone knows the rule applies to all, including leads.', behavior: 'Show Up' },
    ],
  },
  {
    id: 'S21', category: 'Discipline & Accountability',
    text: 'You promised the regional manager a 15-minute average service time. Last week you hit 18. Your team now expects mediocrity. How do you reset the standard?',
    options: [
      { title: 'Say it before they ask', detail: 'I tell the regional manager straight that I missed it, and share my recovery plan before they ask.', behavior: 'Own It' },
      { title: 'Time every peak yourself', detail: "I'm on the floor every peak this week, timing service myself until we're back to 15.", behavior: 'Show Up' },
      { title: 'Find the lost minutes', detail: 'I break down where the 3 minutes went, order taking, kitchen, handover, and fix the biggest gap first.', behavior: 'Reflect & Learn' },
    ],
  },

  // ---------------- Self-Reflection & Learning (4) ----------------
  {
    id: 'S22', category: 'Self-Reflection & Learning',
    text: "You've had three customer complaints about the same issue in two weeks. What's your reflection, and what changes?",
    options: [
      { title: 'Check the fix daily', detail: 'I change one process this week and check it myself every day for two weeks until the complaints stop.', behavior: 'Show Up' },
      { title: 'Dig into all three', detail: 'I study all three complaints together to find what they really have in common.', behavior: 'Reflect & Learn' },
      { title: 'Ask those closest to it', detail: "I ask the crew who handled those orders what they think is going wrong. They're closest to it.", behavior: 'Ask for Help' },
    ],
  },
  {
    id: 'S23', category: 'Self-Reflection & Learning',
    text: "You've never managed a food cost crisis before. Your costs are up 8%. What's your first move?",
    options: [
      { title: 'Learn from someone who has', detail: "I call a branch manager who's handled this and ask them to walk me through what they did.", behavior: 'Ask for Help' },
      { title: 'Trace the 8%', detail: 'I go through waste logs, deliveries and portioning for the last month to see where the 8% came from.', behavior: 'Reflect & Learn' },
      { title: 'Make it the team\'s mission', detail: 'I share the number with my team and ask each station to find one saving in the next week.', behavior: 'Lift Others' },
    ],
  },
  {
    id: 'S24', category: 'Self-Reflection & Learning',
    text: 'You gave the wrong instruction on a stock order and the branch ran out of buns on Saturday night. Your team covered for you. What do you do?',
    options: [
      { title: 'Say it was you', detail: 'I thank the team in front of everyone and say clearly that the mistake was mine.', behavior: 'Own It' },
      { title: 'Build in a second check', detail: "I add a second check on every stock order so one person's mistake can't empty the branch again.", behavior: 'Reflect & Learn' },
      { title: 'Be first in on Sunday', detail: 'I come in early on Sunday to make sure stock is right before we open.', behavior: 'Show Up' },
    ],
  },
  {
    id: 'S25', category: 'Self-Reflection & Learning',
    text: "Your area manager tells you that you take over tasks instead of letting your shift leads lead. It stings. What do you do?",
    options: [
      { title: 'Ask for specifics', detail: 'I ask the area manager for two specific examples so I understand exactly what they saw.', behavior: 'Ask for Help' },
      { title: 'Hand one thing over', detail: 'I pick one task I always take over, hand it fully to a shift lead this week, and coach instead of stepping in.', behavior: 'Lift Others' },
      { title: 'Look at why you do it', detail: 'I reflect on why I do it, trust, speed or control, and write down what I will do differently.', behavior: 'Reflect & Learn' },
    ],
  },
];

module.exports = { SCENARIOS, BEHAVIORS, BEHAVIOR_DEFINITIONS };