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
    body: "Snack duty for our U9 soccer team. We have 6 Saturday games starting April 25 through May 30, against Hawks, Foxes, Bears, Otters, Wolves, and Lions. Two families bring snacks plus drinks per game. No nuts please.",
  },
  {
    id: 'classroom',
    label: 'Classroom or school',
    blurb: 'Potlucks, conference signups, supply drives, volunteer days',
    body: "End-of-year potluck for Mrs. Liu's grade 3 class on Friday May 30 at 5pm. 20 families. We need mains, sides, desserts, and drinks, roughly 5 of each.",
  },
  {
    id: 'community',
    label: 'Community shifts',
    blurb: 'Volunteer shifts, event setup, or rotating roles',
    body: "Volunteers for the spring book fair. Thursday and Friday May 14 to 15, three 2-hour shifts each day (9 to 11, 11 to 1, 1 to 3). 2 volunteers per shift.",
  },
];
