# Frequently Asked Questions

Answers to common questions about finding, sharing and claiming posters on Posters.science. If your question isn't covered here, check the [documentation](https://docs.posters.science) or [contact us](https://tally.so/r/XxEBYP).

## About Posters.science

### What is Posters.science?

Posters.science is an open platform for discovering and sharing scientific posters. It makes posters easier to find, cite and reuse by giving each one structured metadata that follows FAIR (Findable, Accessible, Interoperable, Reusable) principles. It is run by the [FAIR Data Innovations Hub](https://fairdataihub.org).

### Does it cost anything?

No. Browsing, sharing and claiming posters are free.

### Does Posters.science store the poster files?

The poster files themselves live in public repositories such as Zenodo. Posters.science keeps the metadata, a thumbnail image and a link to the archived file, so the repository remains the permanent home of each poster.

## Finding posters

### How do I search for posters?

Type into the search box on the [Find Posters](/discover) page. Plain words search titles, descriptions, keywords, authors, affiliations, DOIs and conference names. Put a phrase in quotes to match it exactly, for example `"machine learning"`.

To search one field, put its name and a colon in front of your term:

| Search for       | Example                      |
| ---------------- | ---------------------------- |
| Title            | `title:microbiome`           |
| Author           | `author:"Jane Doe"`          |
| Affiliation      | `affiliation:stanford`       |
| Keyword          | `keyword:genomics`           |
| Conference       | `conference:ISMB`            |
| DOI              | `doi:10.5281/zenodo.1234567` |
| ORCID iD         | `orcid:0000-0002-1825-0097`  |
| ROR ID           | `ror:0168r3w48`              |
| Funder           | `funder:NIH`                 |
| Award or grant   | `award:R01`                  |
| Text on a poster | `content:"random forest"`    |

You can combine several, such as `author:"Jane Doe" conference:ISMB`. The filters next to the results narrow things down by language, license, year, institution and funder.

### What does "Auto-indexed" mean?

An auto-indexed poster was found and added automatically rather than shared by one of its authors. Posters.science scans public repositories for posters and checks each candidate with [PosterSentry](https://huggingface.co/fairdataihub/poster-sentry), an AI model that recognizes scientific posters. Its metadata comes from the repository record.

### Can I reuse a poster I find here?

Each poster has a license, shown on its page. Follow that license and any terms set by the repository that hosts the file. Many posters use open licenses such as CC BY, which allow reuse with attribution.

### How do I cite a poster?

Cite the poster's DOI, which is shown on its page. A DOI is a permanent link, so the citation keeps working even if the poster moves.

### How do I save posters to come back to later?

Sign in and select **Like** on any poster. Your liked posters are listed under **Liked posters** in the account menu.

## Sharing a poster

### How do I share my poster?

1. Go to [Share a Poster](/share/new) and upload your poster file.
2. Posters.science reads the poster and fills in its metadata for you, such as the title, authors, affiliations and keywords.
3. Review the metadata and correct anything that's wrong.
4. Archive the poster on Zenodo, or download the files to share somewhere else.

You need an account to share a poster.

### Which file types can I upload?

PDF, JPEG or PNG, up to 10MB.

### The extracted metadata has mistakes. What should I do?

Fix them before you publish. The metadata is extracted with AI and can contain errors, so always check the title, authors, affiliations and other fields on the review page.

### Do I need a Zenodo account?

Only to archive your poster on Zenodo. You connect your Zenodo account while publishing, and the record is created in your account, so you stay its owner on Zenodo. If you'd rather use a different repository, choose **Download Locally** to get your poster and its metadata files.

### My poster is already published somewhere else with a DOI. Can I still add it?

Yes. Upload it, review the metadata, and choose **Download Locally** when you publish. Then use **Add publication metadata** on your dashboard to add the existing DOI.

### Can I publish to Figshare?

Not yet. Figshare support is planned.

### Can I change a poster after it's published?

Publishing creates a permanent record on Zenodo, so check your metadata carefully first. If something needs to change on a poster you've already published, [contact us](https://tally.so/r/XxEBYP).

### What is the poster.json file?

`poster.json` is a structured, machine-readable description of your poster that follows the Posters.science schema. It is generated for every poster you share and included when you download your files, which helps other tools and researchers find and reuse your work.

## Claiming auto-indexed posters

### What does claiming a poster do?

Claiming tells Posters.science that you are one of a poster's authors. The poster then appears in the **Published** tab of your dashboard and on your public profile, if you have turned it on.

### Who can claim a poster?

Anyone with an account who is one of the poster's authors. Only auto-indexed posters can be claimed. Posters shared directly on Posters.science already belong to the person who shared them.

### How do I claim a poster?

Open the poster, select **Claim this poster** in the Authors section, and confirm. You don't need to choose which author you are.

### Is my claim checked?

Not when you make it. By claiming, you confirm that you are one of the authors and agree to the [Terms of Use](/terms). Claims that turn out not to be genuine can be removed.

### Can more than one author claim the same poster?

Yes. Every author can claim the same poster, and it appears on each of their profiles.

### Can I edit a poster I claimed?

No. Claiming adds the poster to your dashboard and profile but doesn't change the poster or its metadata. If the details are wrong and you have access to the original repository record, correct them there.

### My name is abbreviated or spelled differently on the poster. Can I fix it?

Author names are shown exactly as they appear in the original record, so citations stay consistent with its DOI. Your public profile shows your name the way you enter it on your [Settings page](/profile).

### How do I remove a claim?

Select **Remove claim** on the poster in your dashboard, or **Remove** next to "Claimed by you" on the poster's page. You can claim it again later.

### Someone claimed a poster they didn't author. What can I do?

[Let us know](https://tally.so/r/XxEBYP) which poster it is. We review reports and remove claims that aren't genuine.

### Can an auto-indexed poster be corrected or removed?

Yes. If an auto-indexed poster has wrong details, isn't a poster, or you'd like it taken down, [contact us](https://tally.so/r/XxEBYP) with a link to it.

### What happens if a poster I claimed is removed?

We sometimes retire (tombstone) a poster record, for example when it's a duplicate. It's hidden from Discover and your public profile, and stays on your dashboard marked **Tombstoned** with the reason. Your claim is kept, so if we restore the poster it comes back for you. Only our team can restore a poster, so [contact us](https://tally.so/r/XxEBYP) if you have questions.

## Your profile and account

### What is a public profile?

An optional page that lists the posters you have shared and claimed, along with your name, affiliation, ORCID iD and a short bio. Visitors can filter your posters to show only the ones you shared yourself or only the ones you claimed. Anyone with the link can see it, and it gives you one place to point people to your posters. Your email address is never shown.

### Why aren't my drafts on my public profile?

Your profile only lists published posters. Drafts and posters you are still preparing stay private in the **In progress** tab of your [dashboard](/dashboard), and they appear on your profile once you publish them.

### How do I make my profile public or private?

Go to your [Settings page](/profile) and use **Make profile public** or **Make profile private**. You can switch at any time. A private profile can't be viewed by anyone else.

### Can other people see the posters I like?

Only if you choose. Turn on **Show my liked posters on my public profile** on your [Settings page](/profile) to add a Liked tab to your public profile. It's off by default, and your likes are never shown while your profile is private.

### What is my profile link?

It looks like `posters.science/profile/k3x9p2q7m4`. The letters and numbers are yours alone and never change, so the link keeps working even if you change your name.

### Why do I need to verify my email address?

Verifying your email confirms that the address is yours and that you can recover your account. You can sign in once it's verified. If the email didn't arrive, check your spam folder. When you try to sign in with an unverified address, the sign-in page offers **Send a new verification email**.

### I forgot my password. What should I do?

Select **Forgot your password?** on the [sign-in page](/login) and we'll email you a link to set a new one.

### How do I change my name, affiliation or bio?

Edit them on your [Settings page](/profile).

### How do I add my ORCID iD?

Enter it in the **ORCID iD** field on your [Settings page](/profile). You can paste the 16-digit iD or your orcid.org link. We check that the iD exists on ORCID, then show it on your public profile with a link to your ORCID record.

### How do I delete my account?

Account deletion isn't available from the site yet. [Contact us](https://tally.so/r/XxEBYP) and we'll delete it for you.

## Privacy and help

### What information do you collect?

The [Privacy Policy](/privacy) explains what we collect and why. In short, we keep your account details and the posters you share or claim, and we use privacy-focused analytics that don't identify you or track you across sites.

### Where can I find more detailed guides?

The [documentation](https://docs.posters.science) covers sharing, metadata and the poster.json schema in more depth.

### How do I report a problem or suggest a feature?

Use our [feedback form](https://tally.so/r/XxEBYP) or open an issue on [GitHub](https://github.com/fairdataihub/posters-science/issues).
