import { Screenshot, Step, Steps, Ui } from '../components';
import { UI } from './take-someone-off-a-slot.ui';

export { UI };

export function TakeSomeoneOffASlot() {
  return (
    <>
      <p>
        You can take one person off a slot, such as someone who can&apos;t come and hasn&apos;t
        cancelled. Their spot opens up, and everyone else stays signed up.
      </p>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Remove someone from a slot</h2>
        <p>
          Removing someone can&apos;t be undone, so check the name and the slot first. They
          don&apos;t get an email about it.
        </p>
        <Steps>
          <Step>
            <p>
              On the <Ui>{UI.yourSignups}</Ui> page, choose your signup.
            </p>
          </Step>
          <Step>
            <p>
              Under your signup&apos;s title, choose the <Ui>{UI.responses}</Ui> tab. It lists
              everyone who has signed up.
            </p>
          </Step>
          <Step>
            <p>
              Find the person, and choose <Ui>{UI.remove}</Ui> at the end of their row. On a phone,
              each person has a card, and <Ui>{UI.remove}</Ui> is next to their email.
            </p>
            <p>
              Only people who are still signed up have this button. Someone signed up for more than
              one slot shows up once for each, so check the slot.
            </p>
          </Step>
          <Step>
            <p>
              You&apos;ll see a question naming them and their slot. Choose{' '}
              <Ui>{UI.yesRemove}</Ui>. To leave them on the slot, choose <Ui>{UI.keep}</Ui> instead.
            </p>
            <Screenshot
              src="/help/take-someone-off-a-slot/confirm.png"
              alt="The question Remove Sam Example from Fruit and water · Sat, Apr 6, with two buttons under it: Keep, and Yes, remove."
              width={416}
              height={184}
            />
          </Step>
        </Steps>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">What happens next</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Their spot opens up. While the signup is open, someone else can sign up for it. If they
            took more than one spot, all of them open up.
          </li>
          <li>
            They stay on the <Ui>{UI.responses}</Ui> tab, marked <Ui>{UI.removed}</Ui>. The number
            on the tab goes down by one.
          </li>
          <li>
            They get no email about it. They get no reminder either, unless it went out before you
            removed them.
          </li>
          <li>
            If they open their link to change or cancel, it says <Ui>{UI.removedPage}</Ui>, and
            names the slot.
          </li>
        </ul>
      </section>
    </>
  );
}
