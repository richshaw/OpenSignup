export interface MagicComposeStarter {
  id: string;
  label: string;
  blurb: string;
  body: string;
}

export const STARTER_PROMPTS: MagicComposeStarter[] = [
  {
    id: 'sports',
    label: 'Sports team',
    blurb: 'Snack, treat, or carpool rosters across a season of games',
    body: "Snack duty for our soccer team. We have 6 Saturday games starting next Saturday. Two families bring snacks plus drinks per game. No nuts please.",
  },
  {
    id: 'classroom',
    label: 'Classroom or school',
    blurb: 'Potlucks, conference signups, supply drives, volunteer days',
    body: 'End-of-year potluck for our grade 3 class on the last Friday of the month at 5pm. 20 families are each bringing one dish: we need 5 families on mains, 5 on sides, 5 on desserts and 5 on drinks.',
  },
  {
    id: 'community',
    label: 'Community shifts',
    blurb: 'Volunteer shifts, event setup, or rotating roles',
    body: "Volunteers for our spring book fair. Thursday and Friday next week, three 2-hour shifts each day (9 to 11, 11 to 1, 1 to 3). 2 volunteers per shift.",
  },
];
