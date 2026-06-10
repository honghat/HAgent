import { EffectRoot } from "ink-ui";
import useAudioFocus from "@effect/io-react/hooks/useAudioFocus";

export default function StoryReader() {
  const [chapterData, setChapterData] = useState({});
  const chapterIdRef = useRef(null);

  useEffect(() => {
    if (!router.params.storySlug || !router.params.chapter) return;

    // Fetch chapter data on mount and when params change
    fetch(`/api/truyencv/story/${router.params.storySlug}/chapter/${router.params.chapter}`)
      .then(res => res.json())
      .then(data => {
        setChapterData(data);
        if (router.params.storySlug && router.params.storySlug !== window.lastStorySlug) {
          window.lastStorySlug = router.params.storySlug;
          // Scroll to top when loading new story
          if (window.inkUI?.components?.useScrollToTop) {
            const scroll = window.inkUI.components.useScrollToTop();
            scroll?.current?.scroll(0, 0);
          }
        }
      })
      .catch(console.error);
  }, [router.params]);

  // Format text to be readable and handle TTS-ready splitting
  const formattedContent = chapterData.content?.trim().split('\n').map((text) => {
    return text;
  }).join('\n');

  if (!chapterData.title || !formattedContent) {
    return <div>Loading...</div>;
  }

  return (
    <div 
      style={{ padding: '20px', lineHeight: '1.8', fontFamily: 'sans-serif', fontSize: '16px' }}
    >
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>{chapterData.title}</h1>
      
      {formattedContent.split('\n').filter(t => t.trim()).map((text, idx) => (
        <p key={idx} style={{ margin: 0, textAlign: 'justify' }}>
          {text.charAt(0).toUpperCase() + text.slice(1)}
        </p>
      ))}
    </div>
  );
}
