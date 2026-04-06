import { ComponentProps } from 'react';
import { CandidateInvitationsView } from './CandidateInvitationsView';
import { CandidateProfileFlow } from './CandidateProfileFlow';
import { CandidateProfileView } from './CandidateProfileView';

type Props = {
  candidateProfileFlowProps: ComponentProps<typeof CandidateProfileFlow>;
  candidateProfileViewProps: ComponentProps<typeof CandidateProfileView>;
  candidateInvitationsViewProps: ComponentProps<typeof CandidateInvitationsView>;
};

export function CandidateAppSection({
  candidateProfileFlowProps,
  candidateProfileViewProps,
  candidateInvitationsViewProps,
}: Props) {
  return (
    <>
      <CandidateProfileFlow {...candidateProfileFlowProps} />
      <CandidateProfileView {...candidateProfileViewProps} />
      <CandidateInvitationsView {...candidateInvitationsViewProps} />
    </>
  );
}
