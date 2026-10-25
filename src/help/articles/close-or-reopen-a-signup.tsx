import { KEEPS_THEIR_SPOT } from '@/lib/spot-counts';
import { Screenshot, Step, Steps, Ui } from '../components';
import { UI } from './close-or-reopen-a-signup.ui';

export { UI };

export function CloseOrReopenASignup() {
  return (
    <>
      <p>
        Once your signup is published, you can close it when you have enough people, or when
        it&apos;s too late to sign up. Nobody new can sign up, and you can reopen it later at the
        same link.
      </p>
      <p>
        A slot is one thing people can sign up for, like snacks for one game. Each slot has one or
        more spots for people to take.
      </p>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Close your signup</h2>
        <p>
          People who open the link will see that it&apos;s closed. Nobody gets an email about it.
        </p>
        <Steps>
          <Step>
            <p>
              On the <Ui>{UI.yourSignups}</Ui> page, choose your signup.
            </p>
          </Step>
          <Step>
            <p>
              At the top of the page, choose the three dots next to <Ui>{UI.share}</Ui>. On a phone,
              they&apos;re next to your signup&apos;s title.
            </p>
          </Step>
          <Step>
            <p>
              Choose <Ui>{UI.closeSignup}</Ui>.
            </p>
          </Step>
          <Step>
            <p>
              You&apos;ll see how many spots are taken or still open, and that nobody can sign up
              until you reopen it. Choose <Ui>{UI.closeSignup}</Ui> again to close it. To leave it
              open, choose <Ui>{UI.notYet}</Ui>.
            </p>
            <Screenshot
              src="/help/close-or-reopen-a-signup/close-question.png"
              alt="The panel under the three dots, saying 3 of 4 spots are still open, people can’t sign up until you reopen it, and everyone already signed up keeps their spot. Under it are Not yet and a red Close signup."
              width={336}
              height={195}
            />
          </Step>
        </Steps>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">While it&apos;s closed</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Your signup is marked <Ui>{UI.closed}</Ui> at the top of the page. Right after you close
            it, a grey box under its title says <Ui>{UI.signupClosed}</Ui>.
          </li>
          <li>
            People who open the link see <Ui>{UI.closedForPeople}</Ui> at the top of the page, and
            on each slot that isn&apos;t full. Nobody new can sign up.
          </li>
          <li>
            {KEEPS_THEIR_SPOT} They can still change their details or cancel with the link they got
            when they signed up, but they can&apos;t take more spots.
          </li>
          <li>
            Closing doesn&apos;t change reminder emails. Anyone who would have got one still does.
          </li>
          <li>Nothing is deleted, and the link stays the same.</li>
        </ul>
        <Screenshot
          src="/help/close-or-reopen-a-signup/what-people-see.png"
          alt="The signup page people see once it’s closed: Closed at the top, saying the signup is no longer collecting responses, and Closed on both slots, Fruit and water and Orange slices."
          width={704}
          height={340}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Reopen your signup</h2>
        <p>
          When you reopen it, people can sign up again straight away, at the same link.{' '}
          <Ui>{UI.reopenSignup}</Ui> doesn&apos;t ask first, and nobody gets an email about it.
        </p>
        <Steps>
          <Step>
            <p>
              On the <Ui>{UI.yourSignups}</Ui> page, choose your signup.
            </p>
          </Step>
          <Step>
            <p>
              At the top of the page, choose <Ui>{UI.reopenSignup}</Ui>, next to{' '}
              <Ui>{UI.preview}</Ui>. On a phone, choose the three dots next to your signup&apos;s
              title first.
            </p>
            <Screenshot
              src="/help/close-or-reopen-a-signup/reopen-button.png"
              alt="Preview and a blue Reopen signup button, at the top right of a closed signup’s page."
              width={280}
              height={68}
            />
          </Step>
        </Steps>
        <p>
          Your signup is marked <Ui>{UI.open}</Ui> again. You don&apos;t need to send the link
          again, since it hasn&apos;t changed.
        </p>
        <p>
          If an AI assistant gave your signup a closing time that has passed, reopening removes it.
          A closing time still to come stays, and nobody can sign up after it.
        </p>
      </section>
    </>
  );
}
